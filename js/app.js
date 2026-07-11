import { TX_DATA } from "./data.js";
import { runBacktest, STRATEGIES } from "./backtest.js";
import {
  findMinimumCapital,
  simulateMarginPath,
  calcMargins,
  formatTWD,
  formatPct,
  TX_MULTIPLIER,
  MAINTENANCE_TO_INITIAL,
} from "./margin.js";

let equityChart = null;
let drawdownChart = null;
let marginChart = null;

const els = {
  strategy: document.getElementById("strategy"),
  contracts: document.getElementById("contracts"),
  capital: document.getElementById("capital"),
  marginRate: document.getElementById("marginRate"),
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  runBtn: document.getElementById("runBtn"),
  dataRange: document.getElementById("dataRange"),
};

function filterData(start, end) {
  return TX_DATA.filter((d) => d.date >= start && d.date <= end);
}

function initControls() {
  const first = TX_DATA[0].date;
  const last = TX_DATA[TX_DATA.length - 1].date;
  els.startDate.value = first < "2020-01-01" ? "2020-01-01" : first;
  els.endDate.value = last;
  els.startDate.min = first;
  els.startDate.max = last;
  els.endDate.min = first;
  els.endDate.max = last;
  els.dataRange.textContent = `${first} ～ ${last}（共 ${TX_DATA.length.toLocaleString()} 個交易日，近月連續契約）`;

  Object.values(STRATEGIES).forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    els.strategy.appendChild(opt);
  });
}

function setStat(id, value, className = "") {
  const el = document.getElementById(id);
  el.textContent = value;
  el.className = "value" + (className ? ` ${className}` : "");
}

function run() {
  const start = els.startDate.value;
  const end = els.endDate.value;
  const strategyId = els.strategy.value;
  const contracts = parseInt(els.contracts.value, 10) || 1;
  const capital = parseInt(els.capital.value, 10) || 0;
  const marginRate = parseFloat(els.marginRate.value) / 100 || 0.145;

  const data = filterData(start, end);
  if (data.length < 30) {
    alert("資料區間太短，請選擇至少 30 個交易日");
    return;
  }

  const bt = runBacktest(data, strategyId, contracts);
  const prices = bt.closes;
  const marginResult = findMinimumCapital(bt.dailyPnl, prices, contracts, marginRate);
  const userSim = simulateMarginPath(bt.dailyPnl, prices, contracts, capital, marginRate);

  // 績效面板
  setStat("totalPnl", formatTWD(bt.totalPnl), bt.totalPnl >= 0 ? "positive" : "negative");
  setStat("cagr", formatPct(bt.cagr), bt.cagr >= 0 ? "positive" : "negative");
  setStat("maxDd", formatPct(userSim.maxDrawdown), "negative");
  setStat("winRate", formatPct(bt.winRate));
  setStat("tradingDays", bt.tradingDays.toLocaleString() + " 天");
  setStat("maxDailyLoss", formatTWD(bt.maxDailyLoss), "negative");
  setStat("finalEquity", formatTWD(capital + bt.totalPnl), capital + bt.totalPnl >= capital ? "positive" : "negative");

  // 保證金面板
  const startPrice = prices[0];
  const endPrice = prices[prices.length - 1];
  const startM = calcMargins(startPrice, Math.abs(contracts), marginRate);
  const endM = calcMargins(endPrice, Math.abs(contracts), marginRate);

  document.getElementById("minCapital").textContent = formatTWD(marginResult.minimum);
  document.getElementById("recCapital").textContent = formatTWD(marginResult.recommended);
  document.getElementById("startInitial").textContent = formatTWD(startM.initial);
  document.getElementById("startMaintenance").textContent = formatTWD(startM.maintenance);
  document.getElementById("endInitial").textContent = formatTWD(endM.initial);
  document.getElementById("contractValue").textContent = formatTWD(endPrice * TX_MULTIPLIER * Math.abs(contracts));

  const alertEl = document.getElementById("marginAlert");
  alertEl.style.display = "block";
  if (userSim.liquidated) {
    const liqDate = bt.dates[userSim.liquidationDate];
    alertEl.className = "alert danger";
    alertEl.innerHTML = `⚠️ 您輸入的資金 <strong>${formatTWD(capital)}</strong> 不足！預計在 <strong>${liqDate}</strong> 因權益低於維持保證金而爆倉。最低需求 <strong>${formatTWD(marginResult.minimum)}</strong>。`;
  } else if (capital < marginResult.recommended) {
    alertEl.className = "alert danger";
    alertEl.innerHTML = `⚠️ 資金勉強高於最低門檻，但低於建議水位 <strong>${formatTWD(marginResult.recommended)}</strong>，仍可能面臨追繳壓力。`;
  } else {
    alertEl.className = "alert safe";
    alertEl.innerHTML = `✅ 您的資金 <strong>${formatTWD(capital)}</strong> 高於建議水位，此策略區間內不會因保證金不足而爆倉。`;
  }

  // 保證金說明動態填入
  document.getElementById("marginExplain").innerHTML = `
    <p>以 <strong>${Math.abs(contracts)} 口大台（TX）</strong>、${STRATEGIES[strategyId].name} 策略，在 <strong>${start}</strong> 至 <strong>${end}</strong> 區間回測：</p>
    <ul>
      <li>開倉時指數約 <strong>${startPrice.toLocaleString()}</strong> 點，原始保證金約 <strong>${formatTWD(startM.initial)}</strong>（契約價值 ${formatTWD(startM.notional)} 的 ${(marginRate * 100).toFixed(1)}%）</li>
      <li>維持保證金約為原始的 <strong>${(MAINTENANCE_TO_INITIAL * 100).toFixed(1)}%</strong>，即 <strong>${formatTWD(startM.maintenance)}</strong></li>
      <li>歷史最大回撤金額 <strong>${formatTWD(marginResult.maxDdAmount)}</strong>，最低不爆倉資金 <strong>${formatTWD(marginResult.minimum)}</strong></li>
      <li>建議資金 <strong>${formatTWD(marginResult.recommended)}</strong>（含緩衝，應對極端行情追繳）</li>
    </ul>
  `;

  renderCharts(bt, capital, marginRate, contracts);
  renderMarginTable(bt, marginResult, capital, marginRate, contracts);
}

function renderCharts(bt, capital, marginRate, contracts) {
  const labels = bt.dates;
  const equity = bt.equityCurve.map((e) => capital + e);

  let peak = equity[0];
  const drawdown = equity.map((e) => {
    if (e > peak) peak = e;
    return peak > 0 ? -(peak - e) / peak : 0;
  });

  const maintenance = bt.closes.map((p) => {
    const notional = p * TX_MULTIPLIER * Math.abs(contracts);
    const initial = Math.ceil(notional * marginRate / 1000) * 1000;
    return Math.ceil(initial * MAINTENANCE_TO_INITIAL / 1000) * 1000;
  });

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: "#8b9ab8", font: { family: "'Noto Sans TC'" } } },
    },
    scales: {
      x: {
        ticks: { color: "#8b9ab8", maxTicksLimit: 8 },
        grid: { color: "rgba(36,48,73,0.5)" },
      },
      y: {
        ticks: { color: "#8b9ab8" },
        grid: { color: "rgba(36,48,73,0.5)" },
      },
    },
  };

  if (equityChart) equityChart.destroy();
  equityChart = new Chart(document.getElementById("equityChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "帳戶權益",
          data: equity,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.1)",
          fill: true,
          pointRadius: 0,
          borderWidth: 1.5,
        },
        {
          label: "維持保證金",
          data: maintenance,
          borderColor: "#fbbf24",
          borderDash: [4, 4],
          pointRadius: 0,
          borderWidth: 1,
        },
      ],
    },
    options: chartOpts,
  });

  if (drawdownChart) drawdownChart.destroy();
  drawdownChart = new Chart(document.getElementById("drawdownChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "回撤",
        data: drawdown,
        borderColor: "#f87171",
        backgroundColor: "rgba(248,113,113,0.2)",
        fill: true,
        pointRadius: 0,
        borderWidth: 1.5,
      }],
    },
    options: {
      ...chartOpts,
      scales: {
        ...chartOpts.scales,
        y: {
          ...chartOpts.scales.y,
          ticks: {
            ...chartOpts.scales.y.ticks,
            callback: (v) => (v * 100).toFixed(0) + "%",
          },
        },
      },
    },
  });

  if (marginChart) marginChart.destroy();
  marginChart = new Chart(document.getElementById("marginChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "台指期近月結算價",
        data: bt.closes,
        borderColor: "#22d3ee",
        pointRadius: 0,
        borderWidth: 1.5,
      }],
    },
    options: chartOpts,
  });
}

function renderMarginTable(bt, marginResult, capital, marginRate, contracts) {
  const tbody = document.getElementById("marginTableBody");
  const sim = marginResult.simulation;

  if (sim.marginCalls.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted)">在最低資金 ${formatTWD(marginResult.minimum)} 下，全期間無爆倉紀錄 ✅</td></tr>`;
    return;
  }

  tbody.innerHTML = sim.marginCalls.slice(0, 10).map((mc) => {
    const date = bt.dates[mc.date];
    const price = bt.closes[mc.date];
    return `<tr>
      <td>${date}</td>
      <td>${price.toLocaleString()}</td>
      <td>${formatTWD(mc.equity)}</td>
      <td>${formatTWD(mc.maintenance)}</td>
    </tr>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  initControls();
  els.runBtn.addEventListener("click", run);
  run();
});
