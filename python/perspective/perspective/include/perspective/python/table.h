/******************************************************************************
 *
 * Copyright (c) 2019, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */
#pragma once
#ifdef PSP_ENABLE_PYTHON

#include <perspective/base.h>
#include <perspective/binding.h>
#include <perspective/python/base.h>

namespace perspective {
namespace binding {

/******************************************************************************
 *
 * Table API
 */
std::shared_ptr<Table> make_table_py(t_val table, t_data_accessor accessor, t_val computed, std::uint32_t limit, py::str index, t_op op, bool is_update, bool is_arrow);
std::shared_ptr<Table> make_computed_table_py(std::shared_ptr<Table> table, t_val computed);

} //namespace binding
} //namespace perspective

#endif