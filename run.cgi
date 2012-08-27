#!/usr/bin/python
# -*- Python -*-

import cgitb
import sys, os

sys.path.insert(0, './lib')

import settings
settings.load(os.getenv('REMOTE_USER'))

if settings.is_debug_mode():
    cgitb.enable()

manatee_dir = settings.get('global', 'manatee_path')
if manatee_dir and manatee_dir not in sys.path:
    sys.path.insert(0, manatee_dir)

import manatee

from conccgi import ConcCGI
from usercgi import UserCGI

MANATEE_REGISTRY = settings.get('corpora', 'manatee_registry')

try:
    from wseval import WSEval
except:
    class WSEval(ConcCGI):
        pass

class BonitoCGI (WSEval, UserCGI):

    # UserCGI options
    _options_dir = settings.get('corpora', 'options_dir')

    # ConcCGI options
    cache_dir = settings.get('corpora', 'cache_dir')
    subcpath = [ settings.get('corpora', 'subcpath') ]
    gdexpath = [] # [('confname', '/path/to/gdex.conf'), ...]

	# set available corpora, e.g.: corplist = ['susanne', 'bnc', 'biwec']
    corplist = settings.get_corplist()

    # set default corpus
    corpname = settings.get_default_corpus(corplist)


    helpsite = 'https://trac.sketchengine.co.uk/wiki/SkE/Help/PageSpecificHelp/'

    def __init__ (self, user=None):
        UserCGI.__init__ (self, user)
        ConcCGI.__init__ (self)

    def _user_defaults (self, user):
        if user is not self._default_user:
            self.subcpath.append ('%s/%s' % (settings.get('corpora', 'users_subcpath'), user))
        self._conc_dir = '%s/%s' % (settings.get('corpora', 'conc_dir'), user)
        self._wseval_dir = '%s/%s' % (settings.get('corpora', 'wseval_dir'), user)


if __name__ == '__main__':

    # logging setup
    import logging
    logger = logging.getLogger('') # root logger
    hdlr = logging.FileHandler(settings.get('global', 'log_path'))
    formatter = logging.Formatter('%(asctime)s [%(name)s] %(levelname)s: %(message)s')
    hdlr.setFormatter(formatter)
    logger.addHandler(hdlr)
    logger.setLevel(logging.INFO)

    if ";prof=" in os.environ['REQUEST_URI'] or "&prof=" in os.environ['REQUEST_URI']:
        import cProfile, pstats, tempfile
        proffile = tempfile.NamedTemporaryFile()
        cProfile.run('''BonitoCGI().run_unprotected (selectorname="corpname",
                        outf=open(os.devnull, "w"))''', proffile.name)
        profstats = pstats.Stats(proffile.name)
        print "<pre>"
        profstats.sort_stats('time','calls').print_stats(50)
        profstats.sort_stats('cumulative').print_stats(50)
        print "</pre>"
    elif not settings.is_debug_mode():
        BonitoCGI().run(selectorname='corpname')
    else:
        BonitoCGI().run_unprotected(selectorname='corpname')
