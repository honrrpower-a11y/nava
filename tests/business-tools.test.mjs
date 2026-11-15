import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function loadCalculations() {
  const form = { addEventListener() {} };
  const sandbox = {
    document: { getElementById(id) { return id === "bizCostForm" ? form : null; } },
    window: {},
    Intl,
    Number,
    Math,
    Object,
    String,
    setTimeout
  };
  const source = await readFile(new URL("../business-tools.js", import.meta.url), "utf8");
  vm.runInNewContext(source, sandbox);
  return sandbox.window.NavaBusinessTools;
}

test("cost calculator computes margin from selling price, not markup", async () => {
  const api = await loadCalculations();
  const result = api.calculateCost({
    materials: 1000000, packaging: 200000, labor: 300000, overhead: 100000, shipping: 100000,
    quantity: 100, margin: 30, salesQuantity: 100
  });
  assert.equal(result.totalCost, 1700000);
  assert.equal(result.unitCost, 17000);
  assert.ok(Math.abs(result.suggestedPrice - 24285.7142857) < 0.001);
  assert.equal(result.sold, 100);
  assert.ok(Math.abs(result.totalProfit - 728571.4285) < 0.01);
});

test("cost calculator caps calculated sales at produced quantity", async () => {
  const api = await loadCalculations();
  const result = api.calculateCost({
    materials: 100, packaging: 0, labor: 0, overhead: 0, shipping: 0,
    quantity: 2, margin: 20, salesQuantity: 5
  });
  assert.equal(result.sold, 2);
  assert.equal(result.unsold, true);
});

test("break-even calculator returns units and revenue including target profit", async () => {
  const api = await loadCalculations();
  const result = api.calculateBreakEven({ fixed: 1000000, variable: 6000, price: 10000, targetProfit: 500000 });
  assert.equal(result.contribution, 4000);
  assert.equal(result.units, 250);
  assert.equal(result.revenue, 2500000);
  assert.equal(result.targetUnits, 375);
});

test("break-even rejects a contribution margin of zero or less", async () => {
  const api = await loadCalculations();
  assert.match(api.calculateBreakEven({ fixed: 1000, variable: 10000, price: 9000, targetProfit: 0 }).error, /بیشتر از هزینه متغیر/);
});

test("monthly budget computes surplus, reserve, and deficit safely", async () => {
  const api = await loadCalculations();
  const surplus = api.calculateBudget({ revenue: 10000000, direct: 3000000, fixed: 1000000, payroll: 2000000, marketing: 500000, other: 500000, reserve: 20 });
  assert.equal(surplus.expenses, 7000000);
  assert.equal(surplus.operatingProfit, 3000000);
  assert.equal(surplus.reserveAmount, 600000);
  assert.equal(surplus.netAfterReserve, 2400000);
  const deficit = api.calculateBudget({ revenue: 100, direct: 200, fixed: 0, payroll: 0, marketing: 0, other: 0, reserve: 20 });
  assert.equal(deficit.operatingProfit, -100);
  assert.equal(deficit.reserveAmount, 0);
  assert.equal(deficit.netAfterReserve, -100);
});

test("monthly budget rejects invalid reserve percentages", async () => {
  const api = await loadCalculations();
  assert.match(api.calculateBudget({ revenue: 1, direct: 0, fixed: 0, payroll: 0, marketing: 0, other: 0, reserve: 101 }).error, /بین صفر تا ۱۰۰/);
});
