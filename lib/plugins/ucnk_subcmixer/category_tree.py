# Copyright (c) 2015 Charles University in Prague, Faculty of Arts,
#                    Institute of the Czech National Corpus
# Copyright (c) 2015 Martin Stepan <martin.stepan@ff.cuni.cz>,
#                    Tomas Machalek <tomas.machalek@gmail.com>
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; version 2
# dated June, 1991.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.

# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

import numpy as np
import copy


class CategoryTreeNode(object):
    def __init__(self, node_id, parent_id, requested_ratio, metadata_condition):
        self.node_id = node_id
        self.parent_id = parent_id
        self.ratio = requested_ratio
        self.metadata_condition = metadata_condition
        self.size = None
        self.computed_bounds = None
        self.children = []


class ExpressionJoin(object):

    def __init__(self, operator):
        self.items = []
        self.operator = operator

    def add(self, item):
        self.items.append(item)

    def negate(self):
        expr = ExpressionJoin('AND' if self.operator == 'OR' else 'OR')
        for item in self.items:
            expr.add(item.negate())
        return expr

    def __iter__(self):
        return self.items.__iter__()

    def __unicode__(self):
        return (u' %s ' % self.operator).join(u'%s' % item for item in self.items)

    def __repr__(self):
        return self.__unicode__().encode('utf-8')


class CategoryExpression(object):
    OPERATORS = {u'==': u'<>', u'<>': u'==', u'<=': u'>=', u'>=': u'<='}

    @staticmethod
    def create(args):
        if args is not None:
            return CategoryExpression(**args)
        return None

    def negate(self):
        return CategoryExpression(self.attr, CategoryExpression.OPERATORS[self.op], self.value)

    def __init__(self, attr, op, value):
        self.attr = attr.replace('.', '_')
        if op not in CategoryExpression.OPERATORS:
            raise Exception('Invalid operator: %s' % op)
        self.op = op
        self.value = value

    def __repr__(self):
        return self.__unicode__().encode('utf-8')

    def __iter__(self):
        return [self].__iter__()

    def __unicode__(self):
        return u"%s %s '%s'" % (self.attr, self.op, self.value)


class CategoryTreeException(Exception):
    pass


class CategoryTree(object):
    """
    Category tree represents the user required corpus structure

    arguments:
    category_list -- A list of categories from which the user wants to generate the corpus including
                     the requested ratios and links to their parent categories
    meta_db -- a Database instance.
    table_name -- Name of the table in metaDB that holds the metadata
    corpus_max_size -- Maximal size of resulting corpora in words

    """
    def __init__(self, category_list, meta_db, table_name, corpus_max_size):
        self.category_list = category_list
        self.num_categories = len(category_list)
        self.meta_db = meta_db
        self.table_name = table_name
        self.corpus_max_size = corpus_max_size
        self.root_node = CategoryTreeNode(self.category_list[0][0], self.category_list[0][1],
                                          self.category_list[0][2], self.category_list[0][3])
        self._db = meta_db
        self._add_virtual_cats()
        self._build()
        self.initialize_bounds()

    def _add_virtual_cats(self):
        updated_list = copy.deepcopy(self.category_list)
        cats_updated = [False] * self.num_categories
        for cat in self.category_list:
            par_id = cat[1]
            if par_id > 0:
                i = 0
                mdc = ExpressionJoin('AND')
                for other_cat in self.category_list:
                    if other_cat[1] == par_id and par_id > 0:
                        cond = other_cat[3].negate()
                        mdc.add(cond)
                        i += 1
                if not cats_updated[par_id]:
                    updated_list.append([self.num_categories, par_id, 0, mdc])
                    cats_updated[par_id] = True
                    self.num_categories += 1
                    self.category_list = updated_list

    def _build(self):
        for i in range(1, self.num_categories):
            cat = self.category_list[i]
            node_id, parent_id, expr, mc = cat
            parent_node = self._get_node_by_id(self.root_node, parent_id)
            pmc = parent_node.metadata_condition
            if pmc is not None:
                res = [mc] + pmc
            else:
                res = [mc]
            cat_node = CategoryTreeNode(node_id, parent_id, expr, res)
            parent_node.children.append(cat_node)

    def _get_node_by_id(self, node, wanted_id):
        if node.node_id != wanted_id:
            if node.children is not None:
                for child in node.children:
                    node = self._get_node_by_id(child, wanted_id)
                    if node is not None and node.node_id == wanted_id:
                        return node
        else:
            return node

    def _get_max_group_sizes(self, sizes, ratios, parent_size):
        num_g = len(sizes)
        children_size = sum(sizes)
        data_size = min(children_size, parent_size)
        required_sizes = [0] * num_g
        max_sizes = None
        while True:
            for i in range(0, num_g):
                required_sizes[i] = data_size * ratios[i]

            reserves = np.subtract(sizes, required_sizes)
            ilr = list(reserves).index(min(reserves))
            lowest_reserve = reserves[ilr]
            if lowest_reserve > -0.001:
                max_sizes = required_sizes
                break
            data_size = sizes[ilr] / float(ratios[ilr])
            for i in range(num_g):
                if i != ilr:
                    sizes[i] = data_size * ratios[i]
        return max_sizes

    def compute_sizes(self, node):
        if len(node.children) > 0:
            sizes = []
            ratios = []
            for child in node.children:
                self.compute_sizes(child)
                sizes.append(child.size)
                ratios.append(child.ratio)
            res = self._get_max_group_sizes(sizes, ratios, node.size)
            # update group size
            node.size = sum(res)
            # update child node sizes
            i = 0
            for n in node.children:
                d = n.size - res[i]
                n.size = res[i]
                if d > 0 and len(n.children) > 0:
                    self.compute_sizes(n)
                i += 1

    def initialize_bounds(self):
        for i in range(1, len(self.category_list)):
            node = self._get_node_by_id(self.root_node, i)
            category_size = self._get_category_size(node.metadata_condition)
            node.size = category_size

        sql = 'SELECT SUM(%s) FROM item WHERE corpus_id = ? ' % self._db.count_col
        self._db.execute(sql, (self._db.corpus_id,))
        max_available = self._db.fetchone()[0]
        if not max_available:
            raise CategoryTreeException('Failed to initialize bounds')

        self.root_node.size = min(self.corpus_max_size, max_available)
        self.compute_sizes(self.root_node)

    def _get_category_size(self, mc):
        """
        This method only computes the maximal available size of category described by provided
        list of metadata conditions

        arguments:
        mc -- A list of metadata sql conditions that determines if texts belongs to this category
        """
        args = [expr.value for subl in mc for expr in subl] + [self._db.corpus_id]
        sql_items = [u'%s %s ?' % (expr.attr, expr.op) for subl in mc for expr in subl]
        self._db.execute(u'SELECT SUM(%s) FROM item WHERE %s AND corpus_id = ?' % (
            self._db.count_col, ' AND '.join(sql_items),), args)
        size = self._db.fetchone()[0]
        return size if size is not None else 0
