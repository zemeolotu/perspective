/******************************************************************************
 *
 * Copyright (c) 2017, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */

const utils = require("@jpmorganchase/perspective-viewer/test/js/utils.js");
const path = require("path");

const simple_tests = require("@jpmorganchase/perspective-viewer/test/js/simple_tests.js");

async function set_lazy(page) {
    const viewer = await page.$("perspective-viewer");
    await page.evaluate(element => {
        element.hypergrid.properties.repaintIntervalRate = 1;
        if (!element.hypergrid._lazy_load) {
            Object.defineProperty(element.hypergrid, "_lazy_load", {
                set: () => {},
                get: () => true
            });
        }
    }, viewer);
}

async function double_click(page, column_name) {
    const viewer = await page.$("perspective-viewer");

    //get mouse coordinates of columns to double click
    const {x, y} = await page.evaluate(
        (element, column_name) => {
            let {x, y} = element.hypergrid.canvas.getOrigin();
            element.hypergrid.behavior.columns.some(column => {
                if (column_name === column.header.split("|").slice(-1)[0]) {
                    return true;
                } else {
                    x += column.getWidth();
                    return false;
                }
            });
            return {x, y};
        },
        viewer,
        column_name
    );

    // double click on column
    await page.mouse.click(x + 10, y + 10, {clickCount: 2});

    await page.waitFor(
        (element, column_name) => {
            return element.sort.findIndex(item => item[0] === column_name) > -1;
        },
        {timeout: 3000},
        viewer,
        column_name
    );
}

utils.with_server({}, () => {
    describe.page(
        "superstore.html",
        () => {
            simple_tests.default();

            describe("expand/collapse", () => {
                test.capture("should not be able to expand past number of row pivots", async page => {
                    const viewer = await page.$("perspective-viewer");
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await page.evaluate(element => element.setAttribute("row-pivots", '["Region"]'), viewer);
                    await page.waitForSelector("perspective-viewer:not([updating])");
                    await page.evaluate(element => element.setAttribute("column-pivots", '["Sub-Category"]'), viewer);

                    await page.evaluate(element => {
                        // 2 is greater than no. of row pivots
                        element.view.expand(2);
                        element.notifyResize();
                    }, viewer);
                    await page.waitForSelector("perspective-viewer:not([updating])");
                });

                test.capture("collapses to depth smaller than viewport", async page => {
                    const viewer = await page.$("perspective-viewer");
                    await page.evaluate(element => element.setAttribute("row-pivots", '["Category","State"]'), viewer);
                    await page.waitForSelector("perspective-viewer:not([updating])");

                    await page.evaluate(element => {
                        element.view.set_depth(0);
                        element.notifyResize();
                    }, viewer);
                    await page.waitForSelector("perspective-viewer:not([updating])");
                });

                test.capture("handles flush", async page => {
                    const viewer = await page.$("perspective-viewer");
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await page.evaluate(element => {
                        element.setAttribute("column-pivots", '["Category"]');
                        element.setAttribute("row-pivots", '["City"]');
                        element.flush().then(() => {
                            element.view.set_depth(0);
                            element.notifyResize();
                        });
                    }, viewer);
                    await page.waitForSelector("perspective-viewer:not([updating])");
                });
            });

            describe("sort indicators", () => {
                test.capture("shows a sort indicator", async page => {
                    const viewer = await page.$("perspective-viewer");
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await page.evaluate(element => element.setAttribute("sort", '[["Row ID", "asc"]]'), viewer);
                });

                test.capture("shows multiple sort indicators", async page => {
                    const viewer = await page.$("perspective-viewer");
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await page.evaluate(element => element.setAttribute("sort", '[["Row ID","asc"],["Order ID","desc"]]'), viewer);
                });

                test.capture("shows a sort indicator on column split", async page => {
                    const viewer = await page.$("perspective-viewer");
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await page.evaluate(element => element.setAttribute("columns", '["Sales", "Profit"]'), viewer);
                    await page.evaluate(element => element.setAttribute("column-pivots", '["Category"]'), viewer);
                    await page.evaluate(element => element.setAttribute("sort", '[["Sales", "desc"]]'), viewer);
                });
            });

            describe("header sort on double click", () => {
                test.capture("double click to sort", async page => {
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await double_click(page, "Order ID");
                });

                test.capture("adds new column sort with alt double click", async page => {
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await double_click(page, "Order ID");

                    await page.keyboard.down("AltLeft");
                    await double_click(page, "Order Date");
                    await page.keyboard.up("AltLeft");
                });

                test.capture("abs sorting on numeric column by shift double click", async page => {
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await page.keyboard.down("ShiftLeft");
                    await double_click(page, "Row ID");
                    await page.keyboard.up("ShiftLeft");
                });

                test.capture("column sorting works with column split", async page => {
                    const viewer = await page.$("perspective-viewer");
                    await page.evaluate(element => element.setAttribute("columns", '["Sales", "Profit"]'), viewer);
                    await page.evaluate(element => element.setAttribute("column-pivots", '["Category"]'), viewer);
                    await page.evaluate(element => element.setAttribute("sort", '[["Category", "asc"],["Sales", "desc"]]'), viewer);
                    await page.shadow_click("perspective-viewer", "#config_button");

                    await page.keyboard.down("AltLeft");
                    await double_click(page, "Sales");
                    await page.keyboard.up("AltLeft");
                });
            });

            describe("lazy render mode", () => {
                test.capture("resets viewable area when the logical size expands.", async page => {
                    await set_lazy(page);
                    const viewer = await page.$("perspective-viewer");
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await page.evaluate(element => element.setAttribute("column-pivots", '["Category"]'), viewer);
                    await page.waitForSelector("perspective-viewer:not([updating])");
                    await page.evaluate(element => element.setAttribute("row-pivots", '["City"]'), viewer);
                });

                test.capture("resets viewable area when the physical size expands.", async page => {
                    await set_lazy(page);
                    const viewer = await page.$("perspective-viewer");
                    await page.shadow_click("perspective-viewer", "#config_button");
                    await page.evaluate(element => element.setAttribute("row-pivots", '["Category"]'), viewer);
                    await page.waitForSelector("perspective-viewer:not([updating])");
                    await page.evaluate(element => element.setAttribute("row-pivots", "[]"), viewer);
                    await page.shadow_click("perspective-viewer", "#config_button");
                });
            });
        },
        {reload_page: false, root: path.join(__dirname, "..", "..")}
    );
});
