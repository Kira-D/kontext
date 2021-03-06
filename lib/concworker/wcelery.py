# Copyright (c) 2015 Institute of the Czech National Corpus
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
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA
# 02110-1301, USA.

import time
import os
import logging
import sys

import concworker
from corplib import CorpusManager


class Sender(concworker.Sender):
    """
    A Pipe-based sender
    """
    def send(self, data):
        pass


class Receiver(concworker.Receiver):
    """
    A Pipe-based receiver
    """
    def __init__(self, async_result):
        self._async_result = async_result

    def receive(self):
        ans = self._async_result.get()
        return ans.get('cachefile'), ans.get('pidfile')


class NotifierFactory(concworker.InitialNotifierFactory):
    def __init__(self, async_result):
        self._async_result = async_result

    def __call__(self):
        return Receiver(self._async_result), Sender()


class TaskRegistration(concworker.GeneralWorker):
    def __init__(self, task_id):
        super(TaskRegistration, self).__init__(task_id=task_id)

    def __call__(self, corpus_name, subc_name, subchash, query, samplesize):
        corpus_manager = CorpusManager()
        corpus_obj = corpus_manager.get_Corpus(corpus_name)
        cache_map = self._cache_factory.get_mapping(corpus_obj)
        pidfile = self._create_pid_file()
        cachefile, stored_pidfile = cache_map.add_to_map(subchash, query, 0, pidfile)
        return dict(cachefile=cachefile, pidfile=pidfile, stored_pidfile=stored_pidfile)


class CeleryCalculation(concworker.GeneralWorker):

    def __init__(self, task_id):
        """
        """
        super(CeleryCalculation, self).__init__(task_id=task_id)

    def __call__(self, initial_args, subc_dir, corpus_name, subc_name, subchash, query, samplesize):
        """
        initial_args -- a dict(cachefile=..., pidfile=..., stored_pidfile=...)
        subc_dir -- a directory where user's subcorpora are stored
        corpus -- a corpus identifier
        subc_name -- subcorpus name (should be None if not present)
        subchash -- an identifier of current subcorpus (None if no subcorpus is in use)
        query -- a tuple/list containing current query
        samplesize -- row limit
        """
        sleeptime = None
        try:
            corpus_manager = CorpusManager(subcpath=(subc_dir,))
            corpus_obj = corpus_manager.get_Corpus(corpus_name, subc_name)
            cache_map = self._cache_factory.get_mapping(corpus_obj)

            if not initial_args.get('stored_pidfile'):
                # The conc object bellow is asynchronous; i.e. you obtain it immediately but it may
                # not be ready yet (this is checked by the 'finished()' method).
                conc = self.compute_conc(corpus_obj, query, samplesize)
                sleeptime = 0.1
                time.sleep(sleeptime)
                conc.save(initial_args['cachefile'], False, True, False)  # partial
                while not conc.finished():
                    # TODO it looks like append=True does not work with Manatee 2.121.1 properly
                    tmp_cachefile = initial_args['cachefile'] + '.tmp'
                    conc.save(tmp_cachefile, False, True, False)
                    os.rename(tmp_cachefile, initial_args['cachefile'])
                    time.sleep(sleeptime)
                    sleeptime += 0.1
                    sizes = self.get_cached_conc_sizes(corpus_obj, query, initial_args['cachefile'])
                    self._update_pidfile(initial_args['pidfile'], last_upd=int(time.time()),
                                         curr_wait=sleeptime, finished=sizes['finished'],
                                         concsize=sizes['concsize'], fullsize=sizes['fullsize'],
                                         relconcsize=sizes['relconcsize'],
                                         task_id=self._task_id)
                tmp_cachefile = initial_args['cachefile'] + '.tmp'
                conc.save(tmp_cachefile)  # whole
                os.rename(tmp_cachefile, initial_args['cachefile'])
                # update size in map file
                cache_map.add_to_map(subchash, query, conc.size())
                os.remove(initial_args['pidfile'])
        except Exception as e:
            # Please note that there is no need to clean any mess (pidfile of failed calculation,
            # unfinished cached concordance etc.) here as this is performed by _get_cached_conc()
            # function in case it detects a problem.
            import traceback
            logging.getLogger(__name__).error('Background calculation error: %s' % e)
            logging.getLogger(__name__).error(''.join(traceback.format_exception(*sys.exc_info())))
            self._update_pidfile(initial_args['pidfile'], last_upd=int(time.time()), curr_wait=sleeptime, error=str(e))



