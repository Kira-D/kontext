# Copyright (c) 2013 Czech National Corpus
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

"""
A plug-in providing user's favorite and global featured corpora lists. The data
are passed through via the 'export' method which is recognized by KonText and then
interpreted via a custom JavaScript (which is an integral part of the plug-in).


Required config.xml/plugins entries:

<corptree>
    <module>corptree</module>
    <file>[a path to a configuration XML file]</file>
    <root_elm_path>
        [an XPath query leading to a root element where configuration can be found]
    </root_elm_path>
    <tag_prefix extension-by="default">
        [a spec. character specifying that the following string is a tag/label]
    </tag_prefix>
</corptree>

How does the corpus list specification XML entry looks like:

<a_root_elm>
  <corpus sentence_struct="p" ident="SUSANNE">
    <metadata>
      <featured />
      <keywords>
        <item>foreign_language_corpora</item>
        <item>written_corpora</item>
      </keywords>
    </metadata>
  </corpus>
   ...
</a_root_elm>

"""

from collections import OrderedDict
import copy
import re

try:
    from markdown import markdown
except ImportError:
    markdown = lambda s: s
from lxml import etree

from plugins.abstract.corpora import AbstractSearchableCorporaArchive
import l10n
import manatee
from fallback_corpus import EmptyCorpus

DEFAULT_LANG = 'en'


def translate_markup(s):
    """
    Transforms markdown markup into HTML
    """
    if not s:
        return None
    return markdown(s.strip())


def call_controller(controller_obj, method, *args, **kwargs):
    return apply(getattr(controller_obj, method), args, kwargs)


class ManateeCorpusInfo(object):
    def __init__(self, corpus, canonical_id):
        self.name = corpus.get_conf('NAME') if corpus.get_conf('NAME') else canonical_id
        self.description = corpus.get_info()
        self.encoding = corpus.get_conf('ENCODING')
        self.size = corpus.size()


class ManateeCorpora(object):
    def __init__(self):
        self._cache = {}

    def get_info(self, canonical_corpus_id):
        try:
            if canonical_corpus_id not in self._cache:
                self._cache[canonical_corpus_id] = ManateeCorpusInfo(
                    manatee.Corpus(canonical_corpus_id), canonical_corpus_id)
            return self._cache[canonical_corpus_id]
        except:
            # refactoring warning: we do not want non-existent/fault items to be cached
            return ManateeCorpusInfo(EmptyCorpus(), None)


class CorpTree(AbstractSearchableCorporaArchive):
    """
    Loads and provides access to a hierarchical list of corpora
    defined in XML format
    """

    FEATURED_KEY = 'featured'
    FAVORITE_KEY = 'favorite'

    def __init__(self, file_path, root_xpath, tag_prefix):
        super(CorpTree, self).__init__(('lang', 'featured_corpora'))  # <- thread local attributes
        self._corplist = None
        self.file_path = file_path
        self.root_xpath = root_xpath
        self._tag_prefix = tag_prefix
        self._messages = {}
        self._keywords = OrderedDict()  # keyword (aka tags) database for corpora
        self._manatee_corpora = ManateeCorpora()

    def _get_corplist_title(self, elm):
        """
        Returns locale-correct title of a corpus group (= CORPLIST XML element)
        """
        ans = None

        if self._lang():
            lang = self._get_iso639lang()
        else:
            lang = DEFAULT_LANG
        if 'title' in elm.attrib:
            if elm.attrib['title']:
                ans = elm.attrib['title']
            else:
                ans = None
        else:
            titles = elm.findall('title')
            if len(titles) > 0:
                matching = [s.text for s in titles if 'lang' in s.attrib and s.attrib['lang'] == lang]
                if len(matching) > 0:
                    ans = matching[0]
        return ans

    def _parse_meta_desc(self, meta_elm):
        ans = {}

        for elm in meta_elm:
            if elm.tag == 'desc':
                if 'ref' in elm.keys():
                    message_key = elm.attrib['ref']
                    if message_key in self._messages:
                        ans = self._messages[message_key]
                else:
                    lang_code = elm.attrib['lang']
                    ans[lang_code] = markdown(elm.text)
                    if 'ident' in elm.keys():
                        message_key = elm.attrib['ident']
                        if message_key not in self._messages:
                            self._messages[message_key] = {}
                        self._messages[message_key][lang_code] = ans[lang_code]
        return ans

    def _parse_keywords(self, root):
        for k in root.findall('./keyword'):
            if k.attrib['ident'] not in self._keywords:
                self._keywords[k.attrib['ident']] = {}
            for lab in k.findall('./label'):
                self._keywords[k.attrib['ident']][lab.attrib['lang']] = lab.text

    def _get_corpus_keywords(self, root):
        """
        Returns fixed labels (= keywords) for the corpus. Please
        note that the "favorite" flag is not included here.
        returns:
        OrderedDict(keyword_id => {...keyword labels...})
        """
        ans = OrderedDict()
        for k in root.findall('./keywords/item'):
            keyword = k.text.strip()
            if keyword in self._keywords:
                if self._keywords[keyword]:
                    ans[keyword] = self._keywords[keyword]
                else:
                    ans[keyword] = keyword
        return ans

    def get_all_corpus_keywords(self):
        ans = []
        lang_key = self._get_iso639lang()
        for label_key, item in self._keywords.items():
            if lang_key in item:
                ans.append((label_key, item[lang_key]))
        return ans

    def _parse_corplist_node(self, root, data, path='/'):
        """
        """
        if not hasattr(root, 'tag') or not root.tag == 'corplist':
            return data
        title = self._get_corplist_title(root)
        if title:
            path = "%s%s/" % (path, title)
        for item in root:
            if not hasattr(item, 'tag'):  # getting rid of non-elements
                continue
            elif item.tag == 'keywords':
                self._parse_keywords(item)
            elif item.tag == 'corplist':
                self._parse_corplist_node(item, data, path)
            elif item.tag == 'corpus':
                corpus_id = item.attrib['ident'].lower()
                web_url = item.attrib['web'] if 'web' in item.attrib else None
                sentence_struct = item.attrib['sentence_struct'] if 'sentence_struct' in item.attrib else None

                ans = {
                    'id': corpus_id,
                    'path': path,
                    'web': web_url,
                    'sentence_struct': sentence_struct,
                    'tagset': item.attrib.get('tagset', None),
                    'speech_segment': item.attrib.get('speech_segment', None),
                    'bib_struct': item.attrib.get('bib_struct', None),
                    'citation_info': {'default_ref': None, 'article_ref': None, 'other_bibliography': None},
                    'metadata': {'database': None, 'label_attr': None, 'id_attr': None, 'desc': {}, 'keywords': {}}
                }

                ref_elm = item.find('reference')
                if ref_elm is not None:
                    ans['citation_info']['default_ref'] = translate_markup(getattr(ref_elm.find('default'),
                                                                                   'text', None))
                    articles = [translate_markup(getattr(x, 'text', None)) for x in ref_elm.findall('article')]
                    ans['citation_info']['article_ref'] = articles
                    ans['citation_info']['other_bibliography'] = translate_markup(
                        getattr(ref_elm.find('other_bibliography'), 'text', None))

                meta_elm = item.find('metadata')
                if meta_elm is not None:
                    ans['metadata']['database'] = getattr(meta_elm.find('database'), 'text', None)
                    ans['metadata']['label_attr'] = getattr(meta_elm.find('label_attr'), 'text', None)
                    ans['metadata']['id_attr'] = getattr(meta_elm.find('id_attr'), 'text', None)
                    ans['metadata']['desc'] = self._parse_meta_desc(meta_elm)
                    ans['metadata']['keywords'] = self._get_corpus_keywords(meta_elm)
                    ans['metadata']['featured'] = True if \
                        meta_elm.find(self.FEATURED_KEY) is not None else False
                data.append(ans)

    @staticmethod
    def _localize_corpus_info(data, lang_code):
        """
        Updates localized values from data (please note that not all
        the data are localized - e.g. paths to files) by a single variant
        given passed lang_code.
        """
        ans = copy.deepcopy(data)
        lang_code = lang_code.split('_')[0]
        desc = ans['metadata']['desc']
        if lang_code in desc:
            ans['metadata']['desc'] = desc[lang_code]
        else:
            ans['metadata']['desc'] = ''

        translated_k = OrderedDict()
        for keyword, label in ans['metadata']['keywords'].items():
            if type(label) is dict and lang_code in label:
                translated_k[keyword] = label[lang_code]
            elif type(label) is str:
                translated_k[keyword] = label
        ans['metadata']['keywords'] = translated_k
        return ans

    def get_corpus_info(self, corp_name, language=None):
        if corp_name != '':
            # get rid of path-like corpus ID prefix
            corp_name = corp_name.split('/')[-1].lower()
            if corp_name in self._raw_list():
                if language is not None:
                    return self._localize_corpus_info(self._raw_list()[corp_name], lang_code=language)
                else:
                    return self._raw_list()[corp_name]
            raise ValueError('Missing configuration data for %s' % corp_name)
        else:
            return {'metadata': {}}  # for 'empty' corpus to work properly

    def _load(self):
        """
        Loads data from a configuration file
        """
        data = []
        with open(self.file_path) as f:
            xml = etree.parse(f)
            root = xml.find(self.root_xpath)
            if root is not None:
                self._parse_corplist_node(root, data, path='/')
        self._corplist = OrderedDict([(item['id'].lower(), item) for item in data])

    def _raw_list(self):
        """
        Returns list of all defined corpora including all lang. variants of labels etc.
        """
        if self._corplist is None:
            self._load()
        return self._corplist

    def _lang(self, v=None):
        """
        Sets or gets UI language. Values are stored in a thread-local storage so
        its ok to serve many clients with different languages via a single plug-in
        instance.

        arguments:
        v -- (optional) if not None then current language is set to [v] else current
        language is returned

        returns:
        current language if called in 'get mode'
        """
        if v is None:
            if not self.haslocal('lang'):
                self.setlocal('lang', DEFAULT_LANG)
            return self.getlocal('lang')
        else:
            self.setlocal('lang', v)

    def _get_iso639lang(self):
        return self._lang().split('_')[0]

    def get_list(self, user_allowed_corpora):
        """
        arguments:
        user_allowed_corpora -- a dict (corpus_canonical_id, corpus_id) containing corpora ids
                                accessible by the current user
        """
        simple_names = set(user_allowed_corpora.keys())
        cl = []
        for item in self._raw_list().values():
            canonical_id, path, web = item['id'], item['path'], item['sentence_struct']
            if canonical_id in simple_names:
                try:
                    corp_id = user_allowed_corpora[canonical_id]
                    corp_info = self._manatee_corpora.get_info(corp_id)

                    cl.append({'id': corp_id,
                               'canonical_id': canonical_id,
                               'name': l10n.import_string(corp_info.name,
                                                          from_encoding=corp_info.encoding),
                               'desc': l10n.import_string(corp_info.description,
                                                          from_encoding=corp_info.encoding),
                               'size': corp_info.size,
                               'path': path
                               })
                except Exception, e:
                    import logging
                    logging.getLogger(__name__).warn(
                        u'Failed to fetch info about %s with error %s (%r)' % (corp_info.name,
                                                                               type(e).__name__, e))
                    cl.append({
                        'id': corp_id, 'canonical_id': canonical_id, 'name': corp_id,
                        'path': path, 'desc': '', 'size': None})
        return cl

    def setup(self, controller_obj):
        """
        Interface method expected by KonText if a module wants to be set-up by
        some "late" information (like locales).

        Please note that each request calls this method on the same instance
        which means that any client-specific data must be thread-local.
        """
        self._lang(getattr(controller_obj, 'ui_lang', None))

    def export(self, *args):
        is_featured = lambda o: o['metadata'].get('featured', False)
        mkitem = lambda x: (x[0], x[0].replace(' ', '_'), x[1])
        corp_labels = [mkitem(item) for item in self.get_all_corpus_keywords()]
        return {
            'featured': [(x['id'], x.get('name', x['id']),
                          l10n.simplify_num(self._manatee_corpora.get_info(x['id']).size))
                         for x in self._raw_list().values() if is_featured(x)],
            'corpora_labels': corp_labels,
            'tag_prefix': self._tag_prefix
        }

    def _parse_query(self, query):
        if query is not None:
            tokens = re.split(r'\s+', query.strip())
        else:
            tokens = []
        query_keywords = []
        substrs = []
        for t in tokens:
            if len(t) > 0:
                if t[0] == self._tag_prefix:
                    query_keywords.append(t[1:])
                else:
                    substrs.append(t)
        return substrs, query_keywords

    def search(self, corplist, query, filter_dict=None):
        ans = {'rows': []}
        used_keywords = set()
        all_keywords_map = dict(self.get_all_corpus_keywords())
        min_size = filter_dict.get('minSize', 0)
        max_size = filter_dict.get('maxSize')

        query_substrs, query_keywords = self._parse_query(query)
        matches_all = lambda d: reduce(lambda t1, t2: t1 and t2, d, True)
        matches_size = lambda d: ((not min_size or int(d.get('size', 0)) >= int(min_size))
                                  and (not max_size or int(d.get('size', 0)) <= int(max_size)))

        for corp in corplist:
            full_data = self.get_corpus_info(corp['id'], self.getlocal('lang'))
            keywords = [k for k in full_data['metadata']['keywords'].keys()]
            if matches_all([k in keywords for k in query_keywords]
                           + [(s in corp['name'] or s in corp['desc']) for s in query_substrs]
                           + [matches_size(corp)]):
                corp['raw_size'] = l10n.simplify_num(corp['size'])
                corp['keywords'] = [(k, all_keywords_map[k]) for k in keywords]
                ans['rows'].append(corp)
                used_keywords.update(keywords)
        ans['rows'] = l10n.sort(ans['rows'], loc=self._lang(), key=lambda v: v['name'])
        ans['keywords'] = l10n.sort(used_keywords, loc=self._lang())
        ans['filters'] = dict(filter_dict)
        return ans

    def initial_search_params(self, query, filter_dict=None):
        query_substrs, query_keywords = self._parse_query(query)
        all_keywords = self.get_all_corpus_keywords()
        exp_keywords = [(k, lab, k in query_keywords) for k, lab in all_keywords]
        return {
            'keywords': exp_keywords,
            'keywordsFieldLabel': 'Available keywords',   # TODO
            'currKeywords': [],  # TODO
            'filters': {
                'maxSize': filter_dict.getlist('maxSize'),
                'minSize': filter_dict.getlist('minSize')
            }
        }


def create_instance(conf):
    """
    Interface function called by KonText creates new plugin instance
    """
    return CorpTree(file_path=conf.get('plugins', 'corptree')['file'],
                    root_xpath=conf.get('plugins', 'corptree')['root_elm_path'],
                    tag_prefix=conf.get('plugins', 'corptree')['default:tag_prefix'])