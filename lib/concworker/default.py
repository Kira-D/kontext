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

import os
import time
import logging
import sys
from multiprocessing import Pipe

import concworker
from concworker import GeneralWorker, InitialNotifierFactory


class Sender(concworker.Sender):
    """
    A Pipe-based sender
    """
    def __init__(self, child_conn):
        self._child_conn = child_conn

    def send(self, data):
        self._child_conn.send(data)


class Receiver(concworker.Receiver):
    """
    A Pipe-based receiver
    """
    def __init__(self, parent_conn):
        self._parent_conn = parent_conn

    def receive(self):
        return self._parent_conn.recv().split('\n')


class NotifierFactory(InitialNotifierFactory):
    def __call__(self):
        parent_conn, child_conn = Pipe(duplex=False)
        return Receiver(parent_conn), Sender(child_conn)


class BackgroundCalc(GeneralWorker):
    """
    This class wraps background calculation of a concordance (see _get_async_conc() function
    below).
    """

    def __init__(self, notification_sender):
        """
        arguments:
        sender -- a concworker.Sender implementation to send initial calculation data
        """
        super(BackgroundCalc, self).__init__()
        self._notification_sender = notification_sender

    def __call__(self, corpus, subchash, query, samplesize):
        sleeptime = None
        try:
            cache_map = self._cache_factory.get_mapping(corpus)
            pidfile = self._create_pid_file()
            cachefile, stored_pidfile = cache_map.add_to_map(subchash, query, 0, pidfile)

            if not stored_pidfile:
                self._notification_sender.send(cachefile + '\n' + pidfile)
                # The conc object bellow is asynchronous; i.e. you obtain it immediately but it may
                # not be ready yet (this is checked by the 'finished()' method).
                conc = self.compute_conc(corpus, query, samplesize)
                sleeptime = 0.1
                time.sleep(sleeptime)
                conc.save(cachefile, False, True, False)  # partial
                while not conc.finished():
                    # TODO it looks like append=True does not work with Manatee 2.121.1 properly
                    tmp_cachefile = cachefile + '.tmp'
                    conc.save(tmp_cachefile, False, True, False)
                    os.rename(tmp_cachefile, cachefile)
                    time.sleep(sleeptime)
                    sleeptime += 0.1
                    sizes = self.get_cached_conc_sizes(corpus, query, cachefile)
                    self._update_pidfile(pidfile, last_upd=int(time.time()), curr_wait=sleeptime,
                                         finished=sizes['finished'], concsize=sizes['concsize'],
                                         fullsize=sizes['fullsize'], relconcsize=sizes['relconcsize'])
                tmp_cachefile = cachefile + '.tmp'
                conc.save(tmp_cachefile)  # whole
                os.rename(tmp_cachefile, cachefile)
                # update size in map file
                cache_map.add_to_map(subchash, query, conc.size())
                os.remove(pidfile)
        except Exception as e:
            # Please note that there is no need to clean any mess (pidfile of failed calculation,
            # unfinished cached concordance etc.) here as this is performed by _get_cached_conc()
            # function in case it detects a problem.
            import traceback
            logging.getLogger(__name__).error('Background calculation error: %s' % e)
            logging.getLogger(__name__).error(''.join(traceback.format_exception(*sys.exc_info())))
            self._update_pidfile(pidfile, last_upd=int(time.time()), curr_wait=sleeptime, error=str(e))
