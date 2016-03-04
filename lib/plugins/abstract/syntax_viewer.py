# Copyright (c) 2016 Czech National Corpus
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


class SyntaxViewerPlugin(object):

    def search_by_token_id(self, corp, canonical_corpname, token_id):
        raise NotImplementedError()


class SyntaxDataBackendError(Exception):
    pass


class SearchBackend(object):

    def get_data(self, corpus, canonical_corpus_id, token_id):
        raise NotImplementedError()
