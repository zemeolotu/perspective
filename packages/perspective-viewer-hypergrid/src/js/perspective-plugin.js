/******************************************************************************
 *
 * Copyright (c) 2017, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */

const rectangular = require("rectangular");
const superscript = require("superscript-number");

/**
 * @this {Behavior}
 * @param payload
 */
function setPSP(payload) {
    const new_schema = [];

    if (payload.isTree) {
        new_schema[this.treeColumnIndex] = {
            name: this.treeColumnIndex.toString(),
            header: " " // space char because empty string defaults to `name`
        };
    }

    payload.columnPaths.forEach(function(columnPath, columnIndex) {
        const col_name = columnPath.join("|"),
            aliases = payload.configuration.columnAliases,
            header = (aliases && aliases[col_name]) || col_name,
            name = columnIndex.toString(),
            type = payload.columnTypes[columnIndex];

        if (payload.isTree && columnIndex === 0) {
            new_schema[-1] = {name, header, type};
        } else {
            new_schema.push({name, header, type});
        }
    });

    this.grid.properties.showTreeColumn = payload.isTree;

    console.log("Setting up initial schema and data load into HyperGrid");

    // Following call to setData signals the grid to call createColumns and dispatch the
    // fin-hypergrid-schema-loaded event (in that order). Here we inject a createColumns override
    // into `this` (behavior instance) to complete the setup before the event is dispatched.
    this.createColumns = createColumns;

    this.grid.setData({
        data: payload.rows,
        schema: new_schema
    });
}

/**
 * @this {Behavior}
 */
function createColumns() {
    Object.getPrototypeOf(this).createColumns.call(this);

    this.getActiveColumns().forEach(function(column) {
        setColumnPropsByType.call(this, column);
    }, this);

    let treeColumn = this.getTreeColumn();
    if (treeColumn) {
        setColumnPropsByType.call(this, treeColumn);
    }

    this.stashedWidths = undefined;

    this.setHeaders(); // grouped-header override that sets all header cell renderers and header row height

    this.schema_loaded = true;
}

/**
 * @this {Behavior}
 */
function setColumnPropsByType(column) {
    var props = column.properties;
    switch (column.type) {
        case "number":
        case "float":
            props.halign = "right";
            props.columnHeaderHalign = "right";
            props.format = "FinanceFloat";
            break;
        case "integer":
            props.halign = "right";
            props.columnHeaderHalign = "right";
            props.format = "FinanceInteger";
            break;
        case "date":
            props.format = "FinanceDate";
            break;
        case "datetime":
            props.format = "FinanceDatetime";
            break;
        default:
            if (column.index === this.treeColumnIndex) {
                props.format = "FinanceTree";
            }
    }
}

/**
 * @this {Behavior}
 */
function formatColumnHeader(value) {
    const config = this.dataModel.getConfig();
    const index = config.sort.findIndex(item => item[0] === value.trim());

    if (index > -1) {
        const direction = config.sort[index][1];

        if (direction in this.charMap) {
            value = `${value} ${this.charMap[direction]}${config.sort.length > 1 ? superscript(index + 1) : ""}`;
        }
    }

    return value;
}

function addSortChars(charMap) {
    Object.assign(charMap, {
        asc: "\u2191",
        desc: "\u2193",
        "asc abs": "\u21E7",
        "desc abs": "\u21E9",
        "col asc": "\u2192",
        "col desc": "\u2190",
        "col asc abs": "\u21E8",
        "col desc abs": "\u21E6"
    });
}

function sortColumn(event) {
    event.preventDefault();
    event.handled = true;
    const behaviour = event.detail.grid.behavior;

    const config = behaviour.dataModel.getConfig();
    const column = behaviour.getColumn(event.detail.column);
    let column_sorting, column_name;

    if (config.column_pivot.length > 0) {
        column_sorting = true;
        column_name = column.header.split("|")[config.column_pivot.length]; // index of last column is always the length of the column pivots
    } else {
        column_sorting = false;
        column_name = column.header;
    }

    const viewer = behaviour.dataModel._viewer;

    const item_index = config.sort.findIndex(item => item[0] === column_name.trim());
    const already_sorted = item_index > -1;

    // shift key to enable abs sorting for non string columns
    // alt key to append to current sort if its a new column or update sort if it's an already sorted column (without removing current sort)
    const abs_sorting = event.detail.keys && (event.detail.keys.indexOf("ALTSHIFT") > -1 || event.detail.keys.indexOf("SHIFT") > -1) && column.type !== "string";
    const alt_pressed = event.detail.keys && (event.detail.keys.indexOf("ALTSHIFT") > -1 || event.detail.keys.indexOf("ALT") > -1);
    let new_sort_direction;

    // if the column is already sorted we increment the sort
    if (already_sorted) {
        const sort_item = config.sort[item_index];
        const direction = sort_item[1];
        new_sort_direction = viewer._increment_sort(direction, column_sorting, abs_sorting);
        sort_item[1] = new_sort_direction;
    } else {
        new_sort_direction = viewer._increment_sort("none", column_sorting, abs_sorting);
    }

    //if alt pressed and column is already sorted, we change the sort for the column and leave the rest as is
    if (alt_pressed && already_sorted) {
        if (new_sort_direction === "none") {
            config.sort.splice(item_index, 1);
        }
        viewer.sort = JSON.stringify(config.sort);
    } else if (alt_pressed) {
        // if alt key is pressed and column is NOT already selected, append the new sort column
        config.sort.push([column_name, new_sort_direction]);
        viewer.sort = JSON.stringify(config.sort);
    } else {
        viewer.sort = JSON.stringify([[column_name, new_sort_direction]]);
    }
}

// `install` makes this a Hypergrid plug-in
exports.install = function(grid) {
    addSortChars(grid.behavior.charMap);

    Object.getPrototypeOf(grid.behavior).setPSP = setPSP;

    Object.getPrototypeOf(grid.behavior).formatColumnHeader = formatColumnHeader;

    Object.getPrototypeOf(grid.behavior).sortColumn = sortColumn;

    Object.getPrototypeOf(grid.behavior).cellClicked = async function(event) {
        event.primitiveEvent.preventDefault();
        event.handled = true;
        const {x, y} = event.dataCell;
        const config = this.dataModel.getConfig();
        const row_pivots = config.row_pivot;
        const column_pivots = config.column_pivot;
        const start_row = y >= 0 ? y : 0;
        const end_row = start_row + 1;
        const r = await this.dataModel._view.to_json({start_row, end_row});
        const row_paths = r.map(x => x.__ROW_PATH__);
        const row_pivot_values = row_paths[0] || [];
        const row_filters = row_pivots
            .map((pivot, index) => {
                const pivot_value = row_pivot_values[index];
                return pivot_value ? [pivot, "==", pivot_value] : undefined;
            })
            .filter(x => x);
        const column_index = row_pivots.length > 0 ? x + 1 : x;
        const column_paths = Object.keys(r[0])[column_index];
        let column_filters = [];
        let column_names;
        if (column_paths) {
            const column_pivot_values = column_paths.split("|");
            column_names = [column_pivot_values[column_pivot_values.length - 1]];
            column_filters = column_pivots
                .map((pivot, index) => {
                    const pivot_value = column_pivot_values[index];
                    return pivot_value ? [pivot, "==", pivot_value] : undefined;
                })
                .filter(x => x);
        }

        const filters = config.filter.concat(row_filters).concat(column_filters);

        this.grid.canvas.dispatchEvent(
            new CustomEvent("perspective-click", {
                bubbles: true,
                composed: true,
                detail: {
                    config: {filters},
                    column_names,
                    row: r[0]
                }
            })
        );

        return this.dataModel.toggleRow(event.dataCell.y, event.dataCell.x, event);
    };

    // function isCanvasBlank(canvas) {
    //     var blank = document.createElement("canvas");
    //     blank.width = canvas.width;
    //     blank.height = canvas.height;

    //     return canvas.toDataURL() == blank.toDataURL();
    // }

    grid.canvas.resize = async function() {
        const width = (this.width = Math.floor(this.div.clientWidth));
        const height = (this.height = Math.floor(this.div.clientHeight));

        //fix ala sir spinka, see
        //http://www.html5rocks.com/en/tutorials/canvas/hidpi/
        //just add 'hdpi' as an attribute to the fin-canvas tag
        let ratio = 1;
        const isHIDPI = window.devicePixelRatio && this.component.properties.useHiDPI;
        if (isHIDPI) {
            const devicePixelRatio = window.devicePixelRatio || 1;
            const backingStoreRatio =
                this.gc.webkitBackingStorePixelRatio || this.gc.mozBackingStorePixelRatio || this.gc.msBackingStorePixelRatio || this.gc.oBackingStorePixelRatio || this.gc.backingStorePixelRatio || 1;

            ratio = devicePixelRatio / backingStoreRatio;
        }

        this.bounds = new rectangular.Rectangle(0, 0, width, height);
        this.component.setBounds(this.bounds);
        this.resizeNotification();

        let render = false;
        if (height * ratio > this.canvas.height) {
            render = await new Promise(resolve => this.component.grid.behavior.dataModel.fetchData(undefined, resolve));
        }

        if (!render) {
            this.bounds = new rectangular.Rectangle(0, 0, width, height);
            this.component.setBounds(this.bounds);

            this.buffer.width = this.canvas.width = width * ratio;
            this.buffer.height = this.canvas.height = height * ratio;

            this.canvas.style.width = this.buffer.style.width = width + "px";
            this.canvas.style.height = this.buffer.style.height = height + "px";

            this.bc.scale(ratio, ratio);
            if (isHIDPI && !this.component.properties.useBitBlit) {
                this.gc.scale(ratio, ratio);
            }

            grid.canvas.paintNow();
        }
    };
};
