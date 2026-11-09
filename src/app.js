import { bootState, persist } from './domain/state.js';
import {
  ensureActiveList,
  addFromQuickText,
  addShoppingItem,
  updateShoppingItem,
  removeShoppingItem,
  toggleShoppingItem,
  shoppingTotals,
  sortShoppingItems,
  inventoryProposalsFromChecked,
  createShoppingList,
} from './domain/shopping.js';
import {
  LOCATIONS,
  STATUSES,
  createInventoryItem,
  setInventoryStatus,
  removeInventory,
  shoppingSuggestionsFromInventory,
  applyPurchaseToInventory,
} from './domain/inventory.js';
import { suggestToday, draftWeek } from './domain/meals.js';
import { parseQuickAdd } from './domain/quick-add.js';

export function createApp(root) {
  let state = bootState();
  ensureActiveList(state);
  persist(state);

  let toast = '';
  let editingId = null;
  let pendingProposals = [];
  let quickDraft = null;

  const setToast = (msg) => {
    toast = msg;
    render();
    if (!msg) return;
    setTimeout(() => {
      if (toast === msg) {
        toast = '';
        render();
      }
    }, 2600);
  };

  const commit = (fn, message) => {
    fn(state);
    persist(state);
    if (message) setToast(message);
    else render();
  };

  function render() {
    const view = state.settings.view || 'shopping';
    root.innerHTML = `
      <div class="shell">
        <header class="top">
          <div>
            <p class="eyebrow">Family Flow</p>
            <h1>${viewTitle(view)}</h1>
          </div>
          <p class="household">${esc(state.household.name)}</p>
        </header>
        <main class="main">${
          view === 'shopping'
            ? shoppingView()
            : view === 'inventory'
              ? inventoryView()
              : view === 'meals'
                ? mealsView()
                : moreView()
        }</main>
        ${toast ? `<div class="toast" role="status">${esc(toast)}</div>` : ''}
        <nav class="tabbar" aria-label="주요 메뉴">
          ${tab('shopping', '장보기')}
          ${tab('inventory', '재고')}
          ${tab('meals', '식단')}
          ${tab('more', '더보기')}
        </nav>
      </div>`;
    bind();
  }

  function tab(id, label) {
    const on = state.settings.view === id;
    return `<button type="button" data-nav="${id}" class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>${label}</button>`;
  }

  function viewTitle(view) {
    return { shopping: '이번 장보기', inventory: '재고', meals: '식단', more: 'Family Flow' }[view];
  }

  function shoppingView() {
    const list = ensureActiveList(state);
    const totals = shoppingTotals(list);
    const items = sortShoppingItems(list.items);
    const must = items.filter((i) => !i.checked && i.priority === 'must');
    const nice = items.filter((i) => !i.checked && i.priority === 'nice');
    const done = items.filter((i) => i.checked);
    const suggestions = shoppingSuggestionsFromInventory(state, list);

    return `
      <section class="budget-card">
        <div><p class="label">예산</p><p class="budget-value">${won(list.budgetWon)}</p></div>
        <div><p class="label">남은 예상</p><p class="budget-value ${totals.overBudget ? 'over' : ''}">${won(totals.estimatedOpen)}${totals.overBudget ? ' · 초과' : ''}</p></div>
        <div><p class="label">진행</p><p class="budget-value">${totals.checkedCount}/${totals.count}</p></div>
      </section>

      <form class="quick-add" data-form="quick-add">
        <label class="sr-only" for="quick-text">장보기 추가</label>
        <textarea id="quick-text" name="text" rows="2" placeholder="예: 휴지가 다 떨어졌어. 휴지 30롤 넣어줘.">${esc(quickDraft?.sourceText || '')}</textarea>
        <div class="quick-actions">
          <button type="button" class="ghost" data-act="preview-quick">미리보기</button>
          <button type="submit" class="primary">목록에 추가</button>
        </div>
        ${
          quickDraft
            ? `<div class="preview-card" role="status">
            <strong>${esc(quickDraft.name)}</strong>
            <span>${quickDraft.quantity}${esc(quickDraft.unit)} · ${quickDraft.priority === 'must' ? '필수' : '선택'} · ${catLabel(quickDraft.category)}</span>
            <p class="hint">맞으면 추가를 누르세요. AI 없이도 규칙으로 해석합니다.</p>
          </div>`
            : ''
        }
      </form>

      <form class="manual-add" data-form="manual-add">
        <details>
          <summary>직접 입력</summary>
          <div class="form-grid">
            <label>품목<input name="name" required maxlength="80" placeholder="휴지" /></label>
            <label>수량<input name="quantity" type="number" min="0.1" step="any" value="1" /></label>
            <label>단위<input name="unit" maxlength="12" value="개" /></label>
            <label>구분<select name="priority"><option value="must">필수</option><option value="nice">선택</option></select></label>
            <label>분류<select name="category"><option value="household">생활용품</option><option value="food">식재료</option><option value="other">기타</option></select></label>
            <label>예상 가격(원)<input name="estimatedPrice" type="number" min="0" step="100" placeholder="선택" /></label>
          </div>
          <button type="submit" class="primary block">추가</button>
        </details>
      </form>

      ${
        suggestions.length
          ? `<section class="panel"><h2>재고에서 제안</h2><ul class="chip-list">${suggestions
              .map(
                (s) =>
                  `<li><button type="button" data-act="add-suggestion" data-name="${esc(s.name)}" data-qty="${s.quantity}" data-unit="${esc(s.unit)}" data-priority="${s.priority}" data-category="${s.category}" data-inventory="${s.inventoryId}">${esc(s.name)}</button></li>`,
              )
              .join('')}</ul></section>`
          : ''
      }

      ${sectionList('필수', must)}
      ${sectionList('있으면 좋음', nice)}
      ${sectionList('구매 완료', done)}

      ${done.length ? `<button type="button" class="secondary block" data-act="propose-inventory">구매 완료 → 재고 반영 제안</button>` : ''}

      ${
        pendingProposals.length
          ? `<section class="panel proposals"><h2>재고에 반영할까요?</h2>
          ${pendingProposals
            .map(
              (p, idx) =>
                `<label class="proposal"><input type="checkbox" name="prop" value="${idx}" checked /><span>${esc(p.name)} → ${esc(LOCATIONS.find((l) => l.id === p.location)?.label || p.location)} · 충분함</span></label>`,
            )
            .join('')}
          <button type="button" class="primary" data-act="apply-proposals">선택한 항목 재고에 반영</button></section>`
          : ''
      }

      <form class="budget-form" data-form="budget">
        <label>이번 장보기 예산(원)<input name="budgetWon" type="number" min="0" step="1000" value="${list.budgetWon ?? ''}" /></label>
        <button type="submit" class="ghost">예산 저장</button>
      </form>`;
  }

  function sectionList(title, rows) {
    if (!rows.length) {
      return `<section class="panel muted"><h2>${title}</h2><p class="empty">아직 없어요.</p></section>`;
    }
    return `<section class="panel"><h2>${title}</h2><ul class="shop-list">${rows.map(shopRow).join('')}</ul></section>`;
  }

  function shopRow(item) {
    if (editingId === item.id) {
      return `<li class="shop-row edit"><form data-form="edit-item" data-id="${item.id}">
        <input name="name" value="${esc(item.name)}" required maxlength="80" />
        <div class="form-grid compact">
          <input name="quantity" type="number" min="0.1" step="any" value="${item.quantity}" />
          <input name="unit" value="${esc(item.unit)}" maxlength="12" />
          <select name="priority"><option value="must" ${item.priority === 'must' ? 'selected' : ''}>필수</option><option value="nice" ${item.priority === 'nice' ? 'selected' : ''}>선택</option></select>
          <input name="estimatedPrice" type="number" min="0" step="100" value="${item.estimatedPrice ?? ''}" placeholder="가격" />
        </div>
        <div class="row-actions">
          <button type="submit" class="primary">저장</button>
          <button type="button" class="ghost" data-act="cancel-edit">취소</button>
        </div>
      </form></li>`;
    }
    return `<li class="shop-row ${item.checked ? 'done' : ''}">
      <label class="check">
        <input type="checkbox" data-act="toggle" data-id="${item.id}" ${item.checked ? 'checked' : ''} />
        <span class="body"><strong>${esc(item.name)}</strong>
        <small>${item.quantity}${esc(item.unit)} · ${item.priority === 'must' ? '필수' : '선택'} · ${catLabel(item.category)}${item.estimatedPrice != null ? ` · ${won(item.estimatedPrice)}` : ''}</small></span>
      </label>
      <div class="row-actions">
        <button type="button" class="icon" data-act="edit" data-id="${item.id}" aria-label="수정">✎</button>
        <button type="button" class="icon danger" data-act="delete" data-id="${item.id}" aria-label="삭제">✕</button>
      </div>
    </li>`;
  }

  function inventoryView() {
    const byLoc = LOCATIONS.map((loc) => ({
      ...loc,
      items: state.inventory.filter((i) => i.location === loc.id),
    }));
    return `
      <p class="lede">정확한 무게는 필요할 때만. 상태만으로도 장보기와 연결됩니다.</p>
      <form class="manual-add" data-form="add-inventory">
        <div class="form-grid">
          <label>이름<input name="name" required maxlength="80" placeholder="브로콜리, 휴지…" /></label>
          <label>위치<select name="location">${LOCATIONS.map((l) => `<option value="${l.id}">${l.label}</option>`).join('')}</select></label>
          <label>상태<select name="status">${STATUSES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select></label>
          <label>수량(선택)<input name="quantity" type="number" min="0" step="any" /></label>
          <label>단위<input name="unit" maxlength="12" placeholder="개" /></label>
          <label>분류<select name="category"><option value="food">식재료</option><option value="household">생활용품</option><option value="other">기타</option></select></label>
        </div>
        <button type="submit" class="primary block">재고 등록</button>
      </form>
      ${byLoc
        .map(
          (loc) => `<section class="panel"><h2>${loc.label}</h2>${
            loc.items.length
              ? `<ul class="inv-list">${loc.items
                  .map(
                    (item) => `<li>
                  <div><strong>${esc(item.name)}</strong><small>${item.quantity != null ? `${item.quantity}${esc(item.unit || '')} · ` : ''}${catLabel(item.category)}</small></div>
                  <div class="status-chips">${STATUSES.map(
                    (s) =>
                      `<button type="button" class="${item.status === s.id ? 'on' : ''}" data-act="inv-status" data-id="${item.id}" data-status="${s.id}">${s.label}</button>`,
                  ).join('')}</div>
                  <button type="button" class="icon danger" data-act="inv-delete" data-id="${item.id}" aria-label="삭제">✕</button>
                </li>`,
                  )
                  .join('')}</ul>`
              : '<p class="empty">비어 있어요.</p>'
          }</section>`,
        )
        .join('')}`;
  }

  function mealsView() {
    const today = suggestToday(state, state.settings.todayFlags || {});
    const plan = state.mealPlan;
    return `
      <p class="lede">매일 새 요리 대신 야채찜·구이 + 소스 변형. AI 없이 규칙으로 제안합니다.</p>
      <section class="panel">
        <h2>오늘</h2>
        <div class="meal-cards">${today.slots
          .map(
            (s) => `<article class="meal-card">
            <p class="label">${mealLabel(s.mealType)}</p>
            <h3>${esc(s.title)}</h3>
            <p>${s.protein ? `${esc(s.protein)} · ` : ''}${s.sauce ? esc(s.sauce.name) : '소스 선택 자유'}</p>
            <small>${esc(s.note || '')}</small>
          </article>`,
          )
          .join('')}</div>
        <div class="row-actions wrap">
          <button type="button" class="ghost" data-act="today-lazy">요리 귀찮음</button>
          <button type="button" class="ghost" data-act="today-noshop">장보기 없이</button>
          <button type="button" class="ghost" data-act="today-refresh">다른 조합</button>
        </div>
      </section>
      <section class="panel">
        <h2>나의 소스 · 방식</h2>
        <ul class="sauce-list">${state.sauces
          .map(
            (s) =>
              `<li><strong>${esc(s.name)}</strong><small>${s.components.map((c) => c.name + (c.prep ? `(${c.prep})` : '')).join(' · ')}${s.exactAmounts === false ? ' · 비율은 나중에' : ''}</small></li>`,
          )
          .join('')}</ul>
      </section>
      <section class="panel">
        <h2>이번 주 초안</h2>
        ${
          plan
            ? `<p class="hint">${esc(plan.weekStart)} 주 · ${plan.status === 'confirmed' ? '확정' : '초안'} · 장보기 자동 연결은 다음 단계</p>
            <ul class="week-list">${plan.days
              .map((d) => {
                const dinner = d.slots.find((x) => x.mealType === 'dinner');
                return `<li><strong>${esc(d.date.slice(5))}</strong> ${esc(dinner?.title || '—')}</li>`;
              })
              .join('')}</ul>
            <div class="row-actions wrap">
              <button type="button" class="secondary" data-act="confirm-week" ${plan.status === 'confirmed' ? 'disabled' : ''}>주간 식단 확정</button>
              <button type="button" class="ghost" data-act="draft-week">초안 다시</button>
            </div>`
            : `<button type="button" class="primary" data-act="draft-week">7일 초안 만들기</button>`
        }
      </section>`;
  }

  function moreView() {
    return `
      <section class="panel">
        <h2>가정</h2>
        <form data-form="household">
          <label>가정 이름<input name="name" value="${esc(state.household.name)}" maxlength="40" /></label>
          <label>기본 장보기 예산<input name="budgetWon" type="number" min="0" step="1000" value="${state.household.budgetWon}" /></label>
          <button type="submit" class="primary">저장</button>
        </form>
      </section>
      <section class="panel">
        <h2>데이터</h2>
        <p class="hint">지금은 이 기기 브라우저에 저장됩니다. Supabase는 별도 프로젝트 생성·승인 후 연결합니다. Haze Flow는 수정하지 않습니다.</p>
        <div class="row-actions wrap">
          <button type="button" class="ghost" data-act="export-json">JSON 내보내기</button>
          <button type="button" class="ghost" data-act="new-list">새 장보기 목록</button>
        </div>
      </section>
      <section class="panel muted">
        <h2>다음 영역 (잠금)</h2>
        <ul class="locked"><li>가족 건강</li><li>가족 일정</li><li>가정 재정 · Haze 연동</li><li>가사 분담</li></ul>
      </section>`;
  }

  function bind() {
    root.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.onclick = () => {
        state.settings.view = btn.dataset.nav;
        editingId = null;
        persist(state);
        render();
      };
    });

    const quick = root.querySelector('[data-form=quick-add]');
    if (quick) {
      quick.onsubmit = (e) => {
        e.preventDefault();
        try {
          commit((s) => addFromQuickText(ensureActiveList(s), new FormData(quick).get('text')), '장보기 목록에 넣었어요.');
          quickDraft = null;
        } catch (err) {
          setToast(err.message);
        }
      };
    }

    const previewBtn = root.querySelector('[data-act=preview-quick]');
    if (previewBtn) {
      previewBtn.onclick = () => {
        const text = root.querySelector('#quick-text')?.value || '';
        quickDraft = parseQuickAdd(text);
        if (!quickDraft) setToast('이름이나 ‘휴지 30롤’처럼 적어주세요.');
        else render();
      };
    }

    const manual = root.querySelector('[data-form=manual-add]');
    if (manual) {
      manual.onsubmit = (e) => {
        e.preventDefault();
        try {
          commit((s) => addShoppingItem(ensureActiveList(s), Object.fromEntries(new FormData(manual))), '추가했어요.');
        } catch (err) {
          setToast(err.message);
        }
      };
    }

    const budget = root.querySelector('[data-form=budget]');
    if (budget) {
      budget.onsubmit = (e) => {
        e.preventDefault();
        const v = Number(new FormData(budget).get('budgetWon'));
        commit((s) => {
          const list = ensureActiveList(s);
          list.budgetWon = Number.isFinite(v) ? v : null;
          s.household.budgetWon = list.budgetWon;
        }, '예산을 저장했어요.');
      };
    }

    root.querySelectorAll('[data-act=toggle]').forEach((el) => {
      el.onchange = () => commit((s) => toggleShoppingItem(ensureActiveList(s), el.dataset.id, el.checked));
    });
    root.querySelectorAll('[data-act=edit]').forEach((el) => {
      el.onclick = () => {
        editingId = el.dataset.id;
        render();
      };
    });
    root.querySelectorAll('[data-act=cancel-edit]').forEach((el) => {
      el.onclick = () => {
        editingId = null;
        render();
      };
    });
    root.querySelectorAll('[data-form=edit-item]').forEach((form) => {
      form.onsubmit = (e) => {
        e.preventDefault();
        try {
          commit(
            (s) => updateShoppingItem(ensureActiveList(s), form.dataset.id, Object.fromEntries(new FormData(form))),
            '수정했어요.',
          );
          editingId = null;
        } catch (err) {
          setToast(err.message);
        }
      };
    });
    root.querySelectorAll('[data-act=delete]').forEach((el) => {
      el.onclick = () => {
        if (!confirm('이 품목을 삭제할까요?')) return;
        commit((s) => removeShoppingItem(ensureActiveList(s), el.dataset.id), '삭제했어요.');
      };
    });
    root.querySelectorAll('[data-act=add-suggestion]').forEach((el) => {
      el.onclick = () =>
        commit((s) => {
          addShoppingItem(ensureActiveList(s), {
            name: el.dataset.name,
            quantity: Number(el.dataset.qty),
            unit: el.dataset.unit,
            priority: el.dataset.priority,
            category: el.dataset.category,
            inventoryId: el.dataset.inventory,
          });
        }, '재고 제안을 목록에 넣었어요.');
    });

    const propose = root.querySelector('[data-act=propose-inventory]');
    if (propose) {
      propose.onclick = () => {
        pendingProposals = inventoryProposalsFromChecked(ensureActiveList(state), state.inventory);
        setToast(pendingProposals.length ? '아래에서 재고 반영을 확인하세요.' : '완료 항목이 없어요.');
      };
    }
    const applyProp = root.querySelector('[data-act=apply-proposals]');
    if (applyProp) {
      applyProp.onclick = () => {
        const checked = [...root.querySelectorAll('[name=prop]:checked')].map((x) => Number(x.value));
        commit((s) => {
          checked.forEach((idx) => applyPurchaseToInventory(s, pendingProposals[idx], { accept: true }));
        }, '재고에 반영했어요.');
        pendingProposals = [];
      };
    }

    const addInv = root.querySelector('[data-form=add-inventory]');
    if (addInv) {
      addInv.onsubmit = (e) => {
        e.preventDefault();
        try {
          commit((s) => {
            s.inventory.push(createInventoryItem(Object.fromEntries(new FormData(addInv))));
          }, '재고를 등록했어요.');
        } catch (err) {
          setToast(err.message);
        }
      };
    }
    root.querySelectorAll('[data-act=inv-status]').forEach((el) => {
      el.onclick = () => commit((s) => setInventoryStatus(s, el.dataset.id, el.dataset.status));
    });
    root.querySelectorAll('[data-act=inv-delete]').forEach((el) => {
      el.onclick = () => {
        if (!confirm('재고에서 삭제할까요?')) return;
        commit((s) => removeInventory(s, el.dataset.id), '삭제했어요.');
      };
    });

    root.querySelectorAll('[data-act=draft-week]').forEach((el) => {
      el.onclick = () => commit((s) => {
        s.mealPlan = draftWeek(s);
      }, '주간 초안을 만들었어요.');
    });
    const confirmWeek = root.querySelector('[data-act=confirm-week]');
    if (confirmWeek) {
      confirmWeek.onclick = () =>
        commit((s) => {
          if (s.mealPlan) s.mealPlan.status = 'confirmed';
        }, '주간 식단을 확정했어요.');
    }
    root.querySelectorAll('[data-act=today-lazy]').forEach((el) => {
      el.onclick = () => {
        state.settings.todayFlags = { lazy: true };
        persist(state);
        setToast('저노력 조합으로 바꿨어요.');
      };
    });
    root.querySelectorAll('[data-act=today-noshop]').forEach((el) => {
      el.onclick = () => {
        state.settings.todayFlags = { ...(state.settings.todayFlags || {}), noShop: true };
        persist(state);
        setToast('재고 위주 메모를 붙였어요.');
      };
    });
    root.querySelectorAll('[data-act=today-refresh]').forEach((el) => {
      el.onclick = () => {
        state.settings.todayFlags = { ...(state.settings.todayFlags || {}) };
        persist(state);
        setToast('조합을 새로 뽑았어요.');
      };
    });

    const hh = root.querySelector('[data-form=household]');
    if (hh) {
      hh.onsubmit = (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(hh));
        commit((s) => {
          s.household.name = String(fd.name || s.household.name).trim() || s.household.name;
          const b = Number(fd.budgetWon);
          if (Number.isFinite(b)) s.household.budgetWon = b;
        }, '가정 정보를 저장했어요.');
      };
    }
    const exp = root.querySelector('[data-act=export-json]');
    if (exp) {
      exp.onclick = () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `familyflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
    }
    const neu = root.querySelector('[data-act=new-list]');
    if (neu) {
      neu.onclick = () =>
        commit((s) => {
          const list = createShoppingList({ budgetWon: s.household.budgetWon });
          s.shoppingLists.unshift(list);
          s.settings.activeListId = list.id;
          s.settings.view = 'shopping';
        }, '새 장보기 목록을 만들었어요.');
    }
  }

  render();
  return { getState: () => state };
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function won(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toLocaleString('ko-KR')}원`;
}
function catLabel(c) {
  return { food: '식재료', household: '생활용품', other: '기타' }[c] || '기타';
}
function mealLabel(t) {
  return { breakfast: '아침', lunch: '점심', dinner: '저녁' }[t] || t;
}
