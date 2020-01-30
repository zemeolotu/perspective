/******************************************************************************
 *
 * Copyright (c) 2017, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */

#include <perspective/table.h>

// Give each Table a unique ID so that operations on it map back correctly
static perspective::t_uindex GLOBAL_TABLE_ID = 0;

namespace perspective {
Table::Table(std::shared_ptr<t_pool> pool, std::vector<std::string> column_names,
    std::vector<t_dtype> data_types, std::uint32_t limit,
    std::string index)
    : m_init(false)
    , m_id(GLOBAL_TABLE_ID++)
    , m_pool(pool)
    , m_column_names(std::move(column_names))
    , m_data_types(std::move(data_types))
    , m_offset(0)
    , m_limit(limit)
    , m_index(std::move(index))
    , m_gnode_set(false) {
        validate_columns(m_column_names);
    }

void
Table::init(t_data_table& data_table, std::uint32_t row_count, const t_op op) {
    /**
     * For the Table to be initialized correctly, make sure that the operation and index columns are
     * processed before the new offset is calculated. Calculating the offset before the `process_op_column`
     * and `process_index_column` causes primary keys to be misaligned.
     */
    process_op_column(data_table, op);
    calculate_offset(row_count);

    if (!m_gnode_set) {
        // create a new gnode, send it to the table
        auto new_gnode = make_gnode(data_table.get_schema());
        set_gnode(new_gnode);
        m_pool->register_gnode(m_gnode.get());
    }

    PSP_VERBOSE_ASSERT(m_gnode_set, "gnode is not set!");
    m_pool->send(m_gnode->get_id(), 0, data_table);

    m_init = true;
}

t_uindex
Table::size() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_gnode->get_table()->size();
}

t_schema
Table::get_schema() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_gnode->get_tblschema();
}

void
Table::add_computed_columns(std::shared_ptr<t_data_table> data_table, std::vector<t_computed_column_def> computed_lambdas) {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex prev_gnode_id = m_gnode->get_id();
    
    // transfer computed lambdas across to the new gnode and recalculate
    auto lambdas = m_gnode->get_computed_lambdas();
    lambdas.insert(lambdas.end(), computed_lambdas.begin(), computed_lambdas.end());

    auto new_gnode = make_gnode(data_table->get_schema());
    set_gnode(new_gnode);

    m_pool->register_gnode(m_gnode.get());
    m_pool->send(m_gnode->get_id(), 0, *data_table, lambdas);
    m_pool->_process();

    unregister_gnode(prev_gnode_id);

    // need to unregister contexts linked back to table
}

std::shared_ptr<t_gnode>
Table::make_gnode(const t_schema& in_schema) {
    t_schema out_schema = in_schema.drop({"psp_pkey", "psp_op"}); 
    auto gnode = std::make_shared<t_gnode>(out_schema, in_schema);
    gnode->init();
    return gnode;
}

void
Table::set_gnode(std::shared_ptr<t_gnode> gnode) {
    m_gnode = gnode;
    m_gnode_set = true;
}

void
Table::unregister_gnode(t_uindex id) {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_pool->unregister_gnode(id);
}

void
Table::reset_gnode(t_uindex id) {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    m_pool->get_gnode(id)->reset();
}

void
Table::calculate_offset(std::uint32_t row_count) {
    m_offset = (m_offset + row_count) % m_limit;
}

t_uindex
Table::get_id() const {
    return m_id;
}

std::shared_ptr<t_pool>
Table::get_pool() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_pool;
}

std::shared_ptr<t_gnode>
Table::get_gnode() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_gnode;
}

const std::vector<std::string>&
Table::get_column_names() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_column_names;
}

const std::vector<t_dtype>&
Table::get_data_types() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_data_types;
}

const std::string&
Table::get_index() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_index;
}

std::uint32_t
Table::get_offset() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_offset;
}

std::uint32_t
Table::get_limit() const {
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_limit;
}

void 
Table::set_column_names(const std::vector<std::string>& column_names) {
    validate_columns(column_names);
    m_column_names = column_names;
}

void 
Table::set_data_types(const std::vector<t_dtype>& data_types) {
    m_data_types = data_types;
}

void
Table::validate_columns(const std::vector<std::string>& column_names) {
    if (m_index != "") {
        // Check if index is valid after getting column names
        bool explicit_index
            = std::find(column_names.begin(), column_names.end(), m_index) != column_names.end();
        if (!explicit_index) {
            PSP_COMPLAIN_AND_ABORT(
                "Specified index `" + m_index + "` does not exist in dataset.");
        }
    }
}

void
Table::process_op_column(t_data_table& data_table, const t_op op) {
    auto op_col = data_table.add_column("psp_op", DTYPE_UINT8, false);
    switch (op) {
        case OP_DELETE: {
            op_col->raw_fill<std::uint8_t>(OP_DELETE);
        } break;
        default: { op_col->raw_fill<std::uint8_t>(OP_INSERT); }
    }
}

} // namespace perspective
