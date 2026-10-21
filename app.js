(function () {
  "use strict";

  const app = document.getElementById("app");
  const allCases = window.TRADE_CASES || [];
  const fieldHelp = window.FIELD_HELP || {};
  const STORAGE_KEY = "document-office-best-v1";

  const issueLabels = {
    quantity: { zh: "数量", en: "QUANTITY" },
    price: { zh: "价格", en: "PRICE" },
    date: { zh: "日期", en: "DATE" },
    port: { zh: "港口", en: "PORT" },
  };

  const state = {
    screen: "title",
    mode: "training",
    cases: [],
    caseIndex: 0,
    activeTab: "invoice",
    selectedField: null,
    selectedIssue: null,
    score: 0,
    streak: 0,
    correct: 0,
    secondsLeft: 300,
    results: [],
    locked: false,
    paused: false,
    sound: true,
    timerId: null,
    audioContext: null,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  }

  function formatMoney(value, currency = "USD") {
    return `${currency} ${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`;
  }

  function formatTime(totalSeconds) {
    const minutes = Math.max(0, Math.floor(totalSeconds / 60));
    const seconds = Math.max(0, totalSeconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function portText(port) {
    return `${port.zh} / ${port.en}`;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function getBestScore() {
    try {
      return Number.parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
    } catch (_error) {
      return 0;
    }
  }

  function saveBestScore(score) {
    try {
      if (score > getBestScore()) localStorage.setItem(STORAGE_KEY, String(score));
    } catch (_error) {
      // Storage is optional. The game still works in private browsing modes.
    }
  }

  function initAudio() {
    if (!state.sound) return null;
    if (!state.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) state.audioContext = new AudioContext();
    }
    if (state.audioContext?.state === "suspended") state.audioContext.resume();
    return state.audioContext;
  }

  function tone(frequency, duration = 0.06, type = "square", volume = 0.035, delay = 0) {
    const context = initAudio();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + duration);
  }

  function playUiSound(kind) {
    if (!state.sound) return;
    if (kind === "select") tone(520, 0.045, "square", 0.025);
    if (kind === "tab") tone(360, 0.045, "square", 0.02);
    if (kind === "stamp") {
      tone(105, 0.13, "sawtooth", 0.05);
      tone(72, 0.1, "square", 0.035, 0.025);
    }
    if (kind === "correct") {
      tone(440, 0.08, "square", 0.03, 0.04);
      tone(660, 0.11, "square", 0.03, 0.13);
    }
    if (kind === "wrong") {
      tone(170, 0.1, "sawtooth", 0.035, 0.04);
      tone(120, 0.16, "sawtooth", 0.035, 0.14);
    }
  }

  function renderTitle() {
    stopTimer();
    state.screen = "title";
    const best = getBestScore();

    app.innerHTML = `
      <main class="title-screen">
        <div class="title-content">
          <header class="title-masthead">
            <div class="ministry-mark" aria-hidden="true"></div>
            <div>
              <h1>CCCP Paperwork</h1>
              <p>COPPER DOCUMENT CONTROL · PORT DESK</p>
            </div>
          </header>

          <div class="briefing-layout">
            <section class="supervisor-card" aria-label="科长简报">
              <div class="pixel-supervisor" aria-hidden="true"></div>
              <div class="speech-box">
                “订单在左，单据在中。找出不一致的字段，选择问题类型，然后盖章。<strong>没有问题，就放行。</strong>”
              </div>
            </section>

            <section class="briefing-paper" aria-labelledby="briefing-title">
              <h2 id="briefing-title">今日审单任务</h2>
              <div class="dispatch-no">调度令：港审训字〔2026〕0718号 · 共 ${allCases.length} 票</div>
              <p class="lead">
                对照采购订单，检查商业发票、装箱单和海运提单。每票最多只有一处关键差异；单据也可能完全正确。
              </p>
              <div class="task-strip" aria-label="需要检查的四类问题">
                <span>数量<small>QUANTITY</small></span>
                <span>单价<small>UNIT PRICE</small></span>
                <span>日期<small>SHIP DATE</small></span>
                <span>港口<small>PORT</small></span>
              </div>
              <p class="lead">
                点击可疑字段后，复核机显示中文、拼音和英文释义。选择问题类型，盖“驳回”；若所有文件一致，直接盖“通过”。
              </p>
              <div class="mode-picker">
                <button class="pixel-button primary" type="button" data-action="start" data-mode="training">
                  练习模式
                  <small>无倒计时 · 逐票讲解</small>
                </button>
                <button class="pixel-button secondary" type="button" data-action="start" data-mode="timed">
                  五分钟值班
                  <small>限时审完全部单据</small>
                </button>
              </div>
              <p class="paper-footnote">
                本游戏使用虚构公司、编号与货运数据。文件结构参考真实进出口业务字段，不构成报关、法律或贸易合规意见。
                ${best ? `本机最高绩效：${best} 分。` : ""}
              </p>
            </section>
          </div>

          <footer class="title-footer">
            原创像素界面 · 中文字体：Fusion Pixel Font（SIL OFL 1.1）· 支持键盘焦点与移动端布局
          </footer>
        </div>
      </main>
    `;
    window.scrollTo(0, 0);
  }

  function startGame(mode) {
    state.screen = "game";
    state.mode = mode;
    state.cases = shuffle(allCases);
    state.caseIndex = 0;
    state.activeTab = "invoice";
    state.selectedField = null;
    state.selectedIssue = null;
    state.score = 0;
    state.streak = 0;
    state.correct = 0;
    state.secondsLeft = 300;
    state.results = [];
    state.locked = false;
    state.paused = false;
    initAudio();
    playUiSound("select");
    renderGame();
    startTimer();
    openModal("instructions");
  }

  function startTimer() {
    stopTimer();
    if (state.mode !== "timed") return;
    state.timerId = window.setInterval(() => {
      if (state.screen !== "game" || state.paused || state.locked) return;
      state.secondsLeft -= 1;
      updateMetrics();
      if (state.secondsLeft <= 0) endGame(true);
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function currentCase() {
    return state.cases[state.caseIndex];
  }

  function renderGame() {
    const current = currentCase();
    if (!current) {
      endGame(false);
      return;
    }

    app.innerHTML = `
      <div class="game-shell">
        <header class="game-topbar">
          <div class="game-brand">
            <div class="ministry-mark" aria-hidden="true"></div>
            <div>
              <h1>CCCP Paperwork</h1>
              <p>COPPER DOCUMENT CONTROL / DESK 04</p>
            </div>
          </div>

          <div class="metrics" aria-label="当前值班状态">
            <div class="metric">
              <span class="label">票号 / CASE</span>
              <strong id="caseMetric">${state.caseIndex + 1} / ${state.cases.length}</strong>
            </div>
            <div class="metric">
              <span class="label">绩效 / SCORE</span>
              <strong id="scoreMetric">${state.score}</strong>
            </div>
            <div class="metric">
              <span class="label">准确 / CORRECT</span>
              <strong id="accuracyMetric">${state.correct} / ${state.results.length}</strong>
            </div>
            <div class="metric">
              <span class="label">剩余 / TIME</span>
              <strong id="timeMetric">${state.mode === "timed" ? formatTime(state.secondsLeft) : "练习"}</strong>
            </div>
          </div>

          <div class="topbar-actions">
            <button class="pixel-button ghost" type="button" data-action="sound" aria-label="切换声音">
              ${state.sound ? "声音 ON" : "声音 OFF"}
            </button>
            <button class="pixel-button ghost" type="button" data-action="glossary">
              <span class="glossary-label">规则 / </span>词汇
            </button>
          </div>
        </header>

        <main class="desk-grid">
          <section class="reference-zone" aria-labelledby="reference-label">
            <div class="zone-label" id="reference-label">基准文件 · REFERENCE</div>
            <div class="paper-pin" aria-hidden="true"></div>
            ${renderPurchaseOrder(current)}
          </section>

          <section class="work-zone" aria-labelledby="work-label">
            <div class="zone-label" id="work-label">待核单据 · CHECK THESE</div>
            <div class="document-tray">
              ${renderTabs()}
              <div id="activeDocument">${renderActiveDocument(current)}</div>
            </div>
          </section>

          <aside class="inspector-zone" aria-labelledby="inspector-title">
            <div class="zone-label">复核设备 · INSPECTOR</div>
            <div class="inspector-machine">
              <div class="machine-header">
                <strong id="inspector-title">差异复核机 04</strong>
                <span class="difficulty-tag">${escapeHtml(current.level)}</span>
                <span class="status-light" aria-label="设备就绪"></span>
              </div>
              ${renderQueue()}
              <div class="selection-screen" id="selectionScreen" aria-live="polite">
                ${renderSelectionScreen()}
              </div>
              <div class="issue-section">
                <div class="machine-section-title">2 / 选择问题类型</div>
                <div class="issue-grid" id="issueGrid">
                  ${renderIssueButtons()}
                </div>
              </div>
              <div class="stamping-bay">
                <div class="machine-section-title">3 / 作出决定并盖章</div>
                <div class="stamp-buttons">
                  <button class="stamp-button reject" type="button" data-decision="reject">
                    驳回
                    <small>REJECT</small>
                  </button>
                  <button class="stamp-button approve" type="button" data-decision="approve">
                    通过
                    <small>APPROVE</small>
                  </button>
                </div>
                <p class="machine-hint">驳回前必须圈选字段和问题类型。通过表示整套单据无误。</p>
              </div>
            </div>
          </aside>
        </main>
      </div>
    `;
    window.scrollTo(0, 0);
  }

  function renderTabs() {
    const tabs = [
      { id: "invoice", zh: "商业发票", en: "INVOICE" },
      { id: "packing", zh: "装箱单", en: "PACKING LIST" },
      { id: "bl", zh: "海运提单", en: "B/L" },
    ];
    return `
      <nav class="document-tabs" aria-label="待核单据">
        ${tabs
          .map(
            (tab) => `
              <button class="tab-button ${state.activeTab === tab.id ? "active" : ""}" type="button"
                data-tab="${tab.id}" aria-pressed="${state.activeTab === tab.id}">
                ${tab.zh}<span>${tab.en}</span>
              </button>
            `,
          )
          .join("")}
      </nav>
    `;
  }

  function renderPurchaseOrder(current) {
    const total = current.quantity * current.unitPrice;
    return `
      <article class="paper-document purchase-order">
        <header class="document-header">
          <div class="document-company">${escapeHtml(current.buyer)}</div>
          <h2>采购订单</h2>
          <p>PURCHASE ORDER</p>
        </header>

        <div class="document-meta">
          ${metaCell("订单号 / PO NO.", current.orderNo)}
          ${metaCell("订单日期 / DATE", current.orderDate)}
          ${metaCell("币种 / CURRENCY", current.currency)}
          ${metaCell("分批装运 / PARTIAL SHIPMENT", current.partialShipment)}
        </div>

        <div class="address-grid">
          ${addressBlock("买方 / BUYER", current.buyer, current.buyerAddress)}
          ${addressBlock("卖方 / SELLER", current.seller, current.sellerAddress)}
        </div>

        <table class="document-table">
          <colgroup>
            <col style="width: 8%" />
            <col style="width: 42%" />
            <col style="width: 16%" />
            <col style="width: 17%" />
            <col style="width: 17%" />
          </colgroup>
          <thead>
            <tr>
              <th>项次<br />ITEM</th>
              <th>货物名称及规格<br />DESCRIPTION</th>
              <th>数量<br />QTY</th>
              <th>单价<br />UNIT PRICE</th>
              <th>金额<br />AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td class="description-cell">
                <strong>${escapeHtml(current.itemZh)}</strong><br />
                ${escapeHtml(current.itemEn)}<br />
                ${escapeHtml(current.spec)}<br />HS ${escapeHtml(current.hsCode)}
              </td>
              <td>${formatNumber(current.quantity)}<br />${escapeHtml(current.unitZh)} / ${escapeHtml(current.unitEn)}</td>
              <td>${formatMoney(current.unitPrice, current.currency)}</td>
              <td>${formatMoney(total, current.currency)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="4">订单总额 / TOTAL</td>
              <td>${formatMoney(total, current.currency)}</td>
            </tr>
          </tbody>
        </table>

        <div class="document-meta">
          ${metaCell("贸易术语 / INCOTERM", current.incoterm, true)}
          ${metaCell("装货港 / PORT OF LOADING", portText(current.loadPort))}
          ${metaCell("卸货港 / PORT OF DISCHARGE", portText(current.dischargePort))}
          ${metaCell("最迟装运日期 / LATEST SHIPMENT", current.latestShipDate, true)}
        </div>

        <div class="document-note">
          单据要求：商业发票、装箱单及运输单据中的货物描述、数量、价格和运输信息须与本订单一致。
        </div>
        <div class="document-signature">授权采购 / AUTHORIZED PURCHASER</div>
      </article>
    `;
  }

  function renderActiveDocument(current) {
    if (state.activeTab === "packing") return renderPackingList(current);
    if (state.activeTab === "bl") return renderBillOfLading(current);
    return renderInvoice(current);
  }

  function renderInvoice(current) {
    return `
      <article class="paper-document commercial-invoice">
        <header class="document-header">
          <div class="document-company">${escapeHtml(current.seller)}</div>
          <h2>商业发票</h2>
          <p>COMMERCIAL INVOICE</p>
        </header>

        <div class="document-meta">
          ${metaCell("发票号码 / INVOICE NO.", current.invoiceNo)}
          ${metaCell(
            "发票日期 / INVOICE DATE",
            fieldButton(current.invoiceDate, "invoice.date", "date", "发票日期", "date"),
            false,
            true,
          )}
          ${metaCell("订单号码 / PO NO.", current.orderNo)}
          ${metaCell("币种 / CURRENCY", current.currency)}
        </div>

        <div class="address-grid">
          ${addressBlock("出口商 / EXPORTER", current.seller, current.sellerAddress)}
          ${addressBlock("收货人 / CONSIGNEE", current.buyer, current.buyerAddress)}
        </div>

        <div class="document-meta">
          ${metaCell(
            "装货港 / PORT OF LOADING",
            fieldButton(portText(current.invoice.loadPort), "invoice.loadPort", "port", "装货港", "loading"),
            false,
            true,
          )}
          ${metaCell(
            "卸货港 / PORT OF DISCHARGE",
            fieldButton(portText(current.invoice.dischargePort), "invoice.dischargePort", "port", "卸货港", "discharge"),
            false,
            true,
          )}
          ${metaCell("贸易术语 / TERMS", current.incoterm, true)}
        </div>

        <table class="document-table">
          <colgroup>
            <col style="width: 8%" />
            <col style="width: 38%" />
            <col style="width: 16%" />
            <col style="width: 18%" />
            <col style="width: 20%" />
          </colgroup>
          <thead>
            <tr>
              <th>项次<br />ITEM</th>
              <th>货物名称及规格<br />DESCRIPTION</th>
              <th>数量<br />QTY</th>
              <th>单价<br />UNIT PRICE</th>
              <th>金额<br />AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td class="description-cell">
                <strong>${escapeHtml(current.itemZh)}</strong><br />
                ${escapeHtml(current.itemEn)}<br />${escapeHtml(current.spec)}
              </td>
              <td>${fieldButton(
                `${formatNumber(current.invoice.quantity)} ${current.unitZh} / ${current.unitEn}`,
                "invoice.quantity",
                "quantity",
                "发票数量",
                "quantity",
              )}</td>
              <td>${fieldButton(
                formatMoney(current.invoice.unitPrice, current.currency),
                "invoice.unitPrice",
                "price",
                "发票单价",
                "price",
              )}</td>
              <td>${formatMoney(current.invoice.total, current.currency)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="4">发票总额 / TOTAL AMOUNT</td>
              <td>${formatMoney(current.invoice.total, current.currency)}</td>
            </tr>
          </tbody>
        </table>

        <div class="document-note">
          兹证明上述货物原产于中国，发票内容真实无误。<br />
          WE CERTIFY THAT THE GOODS ARE OF CHINESE ORIGIN AND THE INFORMATION IS TRUE AND CORRECT.
        </div>
        <div class="document-signature">出口商签章 / EXPORTER SIGNATURE</div>
        <div class="company-chop" aria-hidden="true">出口专用章<br />EXPORT</div>
      </article>
    `;
  }

  function renderPackingList(current) {
    return `
      <article class="paper-document packing-list">
        <header class="document-header">
          <div class="document-company">${escapeHtml(current.seller)}</div>
          <h2>装箱单</h2>
          <p>PACKING LIST</p>
        </header>

        <div class="document-meta">
          ${metaCell("发票号码 / INVOICE NO.", current.invoiceNo)}
          ${metaCell("日期 / DATE", current.invoiceDate)}
          ${metaCell("订单号码 / PO NO.", current.orderNo)}
          ${metaCell("箱唛 / SHIPPING MARK", current.marks)}
        </div>

        <div class="address-grid">
          ${addressBlock("发货人 / SHIPPER", current.seller, current.sellerAddress)}
          ${addressBlock("收货人 / CONSIGNEE", current.buyer, current.buyerAddress)}
        </div>

        <table class="document-table">
          <colgroup>
            <col style="width: 10%" />
            <col style="width: 31%" />
            <col style="width: 16%" />
            <col style="width: 14%" />
            <col style="width: 14%" />
            <col style="width: 15%" />
          </colgroup>
          <thead>
            <tr>
              <th>箱号<br />C/NO.</th>
              <th>货物名称<br />DESCRIPTION</th>
              <th>数量<br />QTY</th>
              <th>净重<br />N.W.</th>
              <th>毛重<br />G.W.</th>
              <th>体积<br />MEAS.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1-${formatNumber(current.packing.packages)}</td>
              <td class="description-cell">
                <strong>${escapeHtml(current.itemZh)}</strong><br />${escapeHtml(current.itemEn)}<br />${escapeHtml(current.spec)}
              </td>
              <td>${fieldButton(
                `${formatNumber(current.packing.quantity)} ${current.unitZh} / ${current.unitEn}`,
                "packing.quantity",
                "quantity",
                "装箱单数量",
                "quantity",
              )}</td>
              <td>${formatNumber(current.netWeight)} KG</td>
              <td>${formatNumber(current.grossWeight)} KG</td>
              <td>${formatNumber(current.volume)} M³</td>
            </tr>
            <tr class="total-row">
              <td colspan="2">合计 / TOTAL</td>
              <td>${formatNumber(current.packing.quantity)} ${escapeHtml(current.unitEn)}</td>
              <td>${formatNumber(current.netWeight)} KG</td>
              <td>${formatNumber(current.grossWeight)} KG</td>
              <td>${formatNumber(current.volume)} M³</td>
            </tr>
          </tbody>
        </table>

        <div class="document-meta">
          ${metaCell("件数及包装 / PACKAGES", `${formatNumber(current.packing.packages)} ${current.packaging}`, true)}
          ${metaCell("集装箱号 / CONTAINER NO.", current.container, true)}
        </div>
        <div class="document-note">
          包装内不含木质垫料。毛重包含外包装；净重为货物实际重量。
        </div>
        <div class="document-signature">装箱人 / PACKED BY</div>
      </article>
    `;
  }

  function renderBillOfLading(current) {
    return `
      <article class="paper-document bill-of-lading">
        <header class="document-header">
          <div class="document-company">海运承运人 / OCEAN CARRIER</div>
          <h2>海运提单</h2>
          <p>BILL OF LADING</p>
        </header>

        <div class="bill-title">不可转让副本 · NON-NEGOTIABLE COPY</div>

        <div class="bl-grid">
          <div class="bl-box tall">
            <span class="meta-label">发货人 / SHIPPER</span>
            ${escapeHtml(current.seller)}<br />${escapeHtml(current.sellerAddress)}
          </div>
          <div class="bl-box">
            <span class="meta-label">提单号 / B/L NO.</span>
            ${escapeHtml(current.blNo)}
          </div>
          <div class="bl-box tall">
            <span class="meta-label">收货人 / CONSIGNEE</span>
            ${escapeHtml(current.buyer)}<br />${escapeHtml(current.buyerAddress)}
          </div>
          <div class="bl-box">
            <span class="meta-label">船名航次 / VESSEL &amp; VOYAGE</span>
            ${escapeHtml(current.vessel)} / ${escapeHtml(current.voyage)}
          </div>
          <div class="bl-box">
            <span class="meta-label">装货港 / PORT OF LOADING</span>
            ${fieldButton(portText(current.bl.loadPort), "bl.loadPort", "port", "提单装货港", "loading")}
          </div>
          <div class="bl-box">
            <span class="meta-label">卸货港 / PORT OF DISCHARGE</span>
            ${fieldButton(portText(current.bl.dischargePort), "bl.dischargePort", "port", "提单卸货港", "discharge")}
          </div>
          <div class="bl-box full">
            <span class="meta-label">已装船日期 / SHIPPED ON BOARD DATE</span>
            ${fieldButton(current.bl.onboardDate, "bl.onboardDate", "date", "已装船日期", "onboard")}
          </div>
        </div>

        <table class="document-table">
          <colgroup>
            <col style="width: 22%" />
            <col style="width: 17%" />
            <col style="width: 38%" />
            <col style="width: 23%" />
          </colgroup>
          <thead>
            <tr>
              <th>标志和号码<br />MARKS &amp; NOS.</th>
              <th>件数<br />NO. OF PKGS.</th>
              <th>货物描述<br />DESCRIPTION</th>
              <th>毛重 / 体积<br />G.W. / MEAS.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(current.marks)}</td>
              <td>${formatNumber(current.bl.packages)}<br />${escapeHtml(current.packaging)}</td>
              <td class="description-cell">
                SAID TO CONTAIN:<br />
                <strong>${escapeHtml(current.itemZh)}</strong><br />
                ${formatNumber(current.packing.quantity)} ${escapeHtml(current.unitEn)}<br />
                ${escapeHtml(current.container)}
              </td>
              <td>${formatNumber(current.grossWeight)} KG<br />${formatNumber(current.volume)} M³</td>
            </tr>
          </tbody>
        </table>

        <div class="document-note">
          运费：到付 / FREIGHT COLLECT · 清洁已装船 / CLEAN ON BOARD<br />
          承运人已接收上述表面状况良好的货物，并按本提单条款运输。
        </div>
        <div class="document-signature">承运人或其代理 / CARRIER OR AGENT</div>
      </article>
    `;
  }

  function metaCell(label, value, wide = false, raw = false) {
    return `
      <div class="meta-cell ${wide ? "wide" : ""}">
        <span class="meta-label">${escapeHtml(label)}</span>
        <div class="meta-value">${raw ? value : escapeHtml(value)}</div>
      </div>
    `;
  }

  function addressBlock(label, company, address) {
    return `
      <div class="address-block">
        <span class="meta-label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(company)}</strong><br />${escapeHtml(address)}
      </div>
    `;
  }

  function fieldButton(value, path, kind, label, helpKey) {
    const selected = state.selectedField?.path === path ? "selected" : "";
    return `
      <button class="doc-field ${selected}" type="button"
        data-field-path="${escapeHtml(path)}"
        data-kind="${escapeHtml(kind)}"
        data-label="${escapeHtml(label)}"
        data-help-key="${escapeHtml(helpKey)}"
        data-value="${escapeHtml(value)}"
        aria-pressed="${selected ? "true" : "false"}">
        ${escapeHtml(value)}
      </button>
    `;
  }

  function renderSelectionScreen() {
    if (!state.selectedField) {
      return `
        <div class="screen-label">1 / 圈选可疑字段</div>
        <div class="screen-placeholder">
          在发票、装箱单或提单中<br />点击带虚线的字段
        </div>
      `;
    }

    const help = fieldHelp[state.selectedField.helpKey] || fieldHelp[state.selectedField.kind] || {
      zh: state.selectedField.label,
      pinyin: "",
      en: state.selectedField.kind,
    };

    return `
      <div class="screen-label">已采集 / EVIDENCE CAPTURED</div>
      <div class="selected-evidence">
        <div class="field-name" data-reading-no-line>${escapeHtml(help.zh || state.selectedField.label)}</div>
        <div class="pinyin">${escapeHtml(help.pinyin || "")}</div>
        <div class="translation">${escapeHtml(help.en || state.selectedField.kind)}</div>
        <div class="captured-value">${escapeHtml(state.selectedField.value)}</div>
      </div>
    `;
  }

  function renderIssueButtons() {
    return Object.entries(issueLabels)
      .map(
        ([key, label]) => `
          <button class="issue-button ${state.selectedIssue === key ? "active" : ""}" type="button"
            data-issue="${key}" aria-pressed="${state.selectedIssue === key}">
            ${label.zh}<span>${label.en}</span>
          </button>
        `,
      )
      .join("");
  }

  function renderQueue() {
    return `
      <div class="case-queue">
        <div class="case-queue-head">
          <span>今日队列 / QUEUE</span>
          <span>${state.results.length} 已处理</span>
        </div>
        <div class="queue-dots" aria-label="案件进度">
          ${state.cases
            .map((_item, index) => {
              let resultClass = "";
              if (index === state.caseIndex) resultClass = "current";
              if (state.results[index]) resultClass = state.results[index].correct ? "correct" : "wrong";
              return `<span class="queue-dot ${resultClass}" title="票 ${index + 1}"></span>`;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function selectDocumentTab(tab) {
    if (state.locked || !["invoice", "packing", "bl"].includes(tab)) return;
    state.activeTab = tab;
    playUiSound("tab");
    document.querySelectorAll(".tab-button").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const activeDocument = document.getElementById("activeDocument");
    if (activeDocument) activeDocument.innerHTML = renderActiveDocument(currentCase());
  }

  function selectField(button) {
    if (state.locked) return;
    state.selectedField = {
      path: button.dataset.fieldPath,
      kind: button.dataset.kind,
      label: button.dataset.label,
      helpKey: button.dataset.helpKey,
      value: button.dataset.value,
    };
    playUiSound("select");
    document.querySelectorAll(".doc-field").forEach((field) => {
      const active = field.dataset.fieldPath === state.selectedField.path;
      field.classList.toggle("selected", active);
      field.setAttribute("aria-pressed", String(active));
    });
    const screen = document.getElementById("selectionScreen");
    if (screen) screen.innerHTML = renderSelectionScreen();
  }

  function selectIssue(issue) {
    if (state.locked || !issueLabels[issue]) return;
    state.selectedIssue = issue;
    playUiSound("select");
    const grid = document.getElementById("issueGrid");
    if (grid) grid.innerHTML = renderIssueButtons();
  }

  function submitDecision(decision) {
    if (state.locked) return;
    if (decision === "reject" && (!state.selectedField || !state.selectedIssue)) {
      showToast("先圈选可疑字段，并选择问题类型。", "SELECT A FIELD AND ISSUE TYPE");
      return;
    }

    state.locked = true;
    playUiSound("stamp");
    document.querySelectorAll("button").forEach((button) => {
      if (!button.closest(".game-topbar")) button.disabled = true;
    });
    document.querySelector(".status-light")?.classList.add("busy");

    const current = currentCase();
    const discrepancy = current.discrepancy;
    let correct = false;

    if (!discrepancy) {
      correct = decision === "approve";
    } else {
      correct =
        decision === "reject" &&
        state.selectedField?.path === discrepancy.field &&
        state.selectedIssue === discrepancy.type;
    }

    if (correct) {
      state.streak += 1;
      state.correct += 1;
      state.score += 100 + Math.min(30, (state.streak - 1) * 10);
    } else {
      state.streak = 0;
      state.score = Math.max(0, state.score - 25);
    }

    state.results[state.caseIndex] = {
      caseId: current.id,
      correct,
      decision,
      selectedField: state.selectedField ? { ...state.selectedField } : null,
      selectedIssue: state.selectedIssue,
      answer: discrepancy?.type || "clean",
    };

    updateMetrics();
    window.setTimeout(() => {
      playUiSound(correct ? "correct" : "wrong");
      showResultSlip(correct, decision);
    }, 180);
  }

  function showResultSlip(correct, decision) {
    const current = currentCase();
    const discrepancy = current.discrepancy;
    const selectedDescription = state.selectedField
      ? `${state.selectedField.label}：${state.selectedField.value} / ${issueLabels[state.selectedIssue]?.zh || "未分类"}`
      : "未圈选字段";

    const explanation = discrepancy
      ? `
          <p class="answer-line">
            <strong>正确差异：</strong>${issueLabels[discrepancy.type].zh}<br />
            文件值：${escapeHtml(discrepancy.actual)}<br />
            应为：${escapeHtml(discrepancy.expected)}
          </p>
          <p>${escapeHtml(discrepancy.reasonZh)}</p>
          <p><strong>业务后果：</strong>${escapeHtml(discrepancy.impactZh)}</p>
          <p class="english-note">${escapeHtml(discrepancy.reasonEn)}</p>
        `
      : `
          <p class="answer-line"><strong>正确结论：</strong>单据一致，可以通过。</p>
          <p>${escapeHtml(current.note || "采购订单、发票、装箱单和提单中的关键字段互相一致。")}</p>
          <p class="english-note">The key commercial and transport details are consistent across the document set.</p>
        `;

    const slip = document.createElement("section");
    slip.className = "result-slip";
    slip.setAttribute("role", "dialog");
    slip.setAttribute("aria-modal", "true");
    slip.setAttribute("aria-labelledby", "resultTitle");
    slip.innerHTML = `
      <div class="result-heading">
        <h2 id="resultTitle">复核回执</h2>
        <div class="verdict-mark ${correct ? "correct" : "wrong"}">
          ${correct ? "处理正确" : "处理有误"}
        </div>
      </div>
      <div class="result-body">
        <p><strong>你的处理：</strong>${decision === "approve" ? "通过 / APPROVE" : "驳回 / REJECT"}</p>
        <p><strong>你的证据：</strong>${escapeHtml(selectedDescription)}</p>
        ${explanation}
      </div>
      <div class="result-actions">
        <button class="pixel-button primary" type="button" data-action="next-case">
          ${state.caseIndex + 1 >= state.cases.length ? "查看值班报告" : "下一票单据"}
        </button>
      </div>
    `;
    app.appendChild(slip);
    slip.querySelector("button")?.focus();
  }

  function nextCase() {
    document.querySelector(".result-slip")?.remove();
    state.caseIndex += 1;
    if (state.caseIndex >= state.cases.length) {
      endGame(false);
      return;
    }
    state.activeTab = "invoice";
    state.selectedField = null;
    state.selectedIssue = null;
    state.locked = false;
    renderGame();
  }

  function updateMetrics() {
    const score = document.getElementById("scoreMetric");
    const accuracy = document.getElementById("accuracyMetric");
    const time = document.getElementById("timeMetric");
    if (score) score.textContent = String(state.score);
    if (accuracy) accuracy.textContent = `${state.correct} / ${state.results.filter(Boolean).length}`;
    if (time) {
      time.textContent = state.mode === "timed" ? formatTime(state.secondsLeft) : "练习";
      time.classList.toggle("danger", state.mode === "timed" && state.secondsLeft <= 60);
    }
  }

  function showToast(chinese, english) {
    document.querySelector(".machine-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "machine-toast";
    toast.setAttribute("role", "status");
    toast.innerHTML = `${escapeHtml(chinese)}<span>${escapeHtml(english)}</span>`;
    document.body.appendChild(toast);
    playUiSound("wrong");
    window.setTimeout(() => toast.remove(), 2600);
  }

  function openModal(type) {
    if (document.querySelector(".modal-backdrop")) return;
    state.paused = true;
    const title = type === "instructions" ? "操作方法" : "规则与审单词汇";
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.dataset.modal = type;
    modal.innerHTML = `
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <header class="modal-header">
          <h2 id="modalTitle">${title}</h2>
          <button class="pixel-button ghost" type="button" data-action="close-modal">关闭 ×</button>
        </header>
        <div class="modal-body">
          <h3>审单流程 / WORKFLOW</h3>
          <ol>
            <li>以左侧<strong>采购订单</strong>为合同基准。</li>
            <li>切换商业发票、装箱单和海运提单，比较关键字段。</li>
            <li>发现差异：点击错误字段 → 选择数量、价格、日期或港口 → 盖“驳回”。</li>
            <li>全部一致：不要圈选字段，直接盖“通过”。</li>
          </ol>
          <h3>现实规则 / REAL-WORLD LOGIC</h3>
          <ul>
            <li>商业发票的数量、单价和金额应与订单及实际货物相符。</li>
            <li>装箱单描述实际包装、数量、净重和毛重；毛重通常高于净重。</li>
            <li>提单记录承运人接管或装船的货物、装卸港和已装船日期。</li>
            <li>日期并非越早越好；只有超过订单明确规定的最迟装运日才构成本游戏中的日期差异。</li>
          </ul>
          <h3>核心词汇 / GLOSSARY</h3>
          <div class="glossary-grid">
            ${renderGlossaryItem("商业发票", "shāng yè fā piào", "commercial invoice")}
            ${renderGlossaryItem("装箱单", "zhuāng xiāng dān", "packing list")}
            ${renderGlossaryItem("提单", "tí dān", "bill of lading")}
            ${renderGlossaryItem("数量", "shù liàng", "quantity")}
            ${renderGlossaryItem("单价", "dān jià", "unit price")}
            ${renderGlossaryItem("最迟装运日", "zuì chí zhuāng yùn rì", "latest shipment date")}
            ${renderGlossaryItem("装货港", "zhuāng huò gǎng", "port of loading")}
            ${renderGlossaryItem("卸货港", "xiè huò gǎng", "port of discharge")}
          </div>
        </div>
      </section>
    `;
    document.body.appendChild(modal);
    modal.querySelector("button")?.focus();
  }

  function renderGlossaryItem(zh, pinyin, en) {
    return `<div class="glossary-item" data-reading-no-line><strong>${zh}</strong><span>${pinyin}</span><span>${en}</span></div>`;
  }

  function closeModal() {
    document.querySelector(".modal-backdrop")?.remove();
    state.paused = false;
    document.querySelector("[data-action='glossary']")?.focus();
  }

  function toggleSound() {
    state.sound = !state.sound;
    const button = document.querySelector("[data-action='sound']");
    if (button) button.textContent = state.sound ? "声音 ON" : "声音 OFF";
    if (state.sound) playUiSound("select");
  }

  function endGame(timedOut) {
    stopTimer();
    document.querySelector(".modal-backdrop")?.remove();
    document.querySelector(".result-slip")?.remove();
    state.screen = "end";
    state.paused = false;
    saveBestScore(state.score);

    const processed = state.results.filter(Boolean).length;
    const accuracy = processed ? Math.round((state.correct / processed) * 100) : 0;
    const grade = accuracy >= 88 && processed === state.cases.length ? "A" : accuracy >= 70 ? "B" : accuracy >= 50 ? "C" : "D";
    const message = timedOut
      ? "值班时间已结束。速度重要，但真实业务中仍应优先保证申报数据准确。"
      : grade === "A"
        ? "复核准确、证据清楚。你已具备独立处理常规出口单证的训练水平。"
        : grade === "B"
          ? "整体可靠。再注意交叉核对订单条件与提单运输栏位。"
          : "建议回到练习模式，逐项比较订单、发票、装箱单与提单。";

    app.innerHTML = `
      <main class="end-screen">
        <section class="end-dossier">
          <div class="end-paper">
            <h1>值班绩效报告</h1>
            <div class="grade" aria-label="评级 ${grade}">${grade}</div>
            <div class="end-stats">
              <div class="end-stat"><span>得分 / SCORE</span><strong>${state.score}</strong></div>
              <div class="end-stat"><span>正确 / CORRECT</span><strong>${state.correct}</strong></div>
              <div class="end-stat"><span>处理 / PROCESSED</span><strong>${processed}</strong></div>
              <div class="end-stat"><span>准确率 / ACCURACY</span><strong>${accuracy}%</strong></div>
            </div>
            <p class="end-message">${message}</p>
            <div class="case-review" aria-label="案件处理明细">
              ${state.cases
                .map((item, index) => {
                  const result = state.results[index];
                  const answer = item.discrepancy ? issueLabels[item.discrepancy.type].zh : "无误";
                  return `
                    <div class="review-row">
                      <span>${escapeHtml(item.id)} · ${answer}</span>
                      <strong class="${result?.correct ? "ok" : "bad"}">${result?.correct ? "正确" : result ? "错误" : "未处理"}</strong>
                    </div>
                  `;
                })
                .join("")}
            </div>
            <div class="end-actions">
              <button class="pixel-button primary" type="button" data-action="restart">重新值班</button>
              <button class="pixel-button secondary" type="button" data-action="title">返回封面</button>
            </div>
          </div>
        </section>
      </main>
    `;
    window.scrollTo(0, 0);
  }

  app.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.dataset.action === "start") startGame(target.dataset.mode || "training");
    if (target.dataset.action === "sound") toggleSound();
    if (target.dataset.action === "glossary") openModal("glossary");
    if (target.dataset.action === "next-case") nextCase();
    if (target.dataset.action === "restart") startGame(state.mode);
    if (target.dataset.action === "title") renderTitle();
    if (target.dataset.tab) selectDocumentTab(target.dataset.tab);
    if (target.dataset.fieldPath) selectField(target);
    if (target.dataset.issue) selectIssue(target.dataset.issue);
    if (target.dataset.decision) submitDecision(target.dataset.decision);
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (target?.dataset.action === "close-modal") closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector(".modal-backdrop")) closeModal();
    if (state.screen !== "game" || state.locked || document.querySelector(".modal-backdrop")) return;
    if (event.key === "1") selectDocumentTab("invoice");
    if (event.key === "2") selectDocumentTab("packing");
    if (event.key === "3") selectDocumentTab("bl");
  });

  renderTitle();
})();
