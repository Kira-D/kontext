/*
 * Copyright (c) 2013 Institute of the Czech National Corpus
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; version 2
 * dated June, 1991.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.

 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

/**
 * This module contains functionality related directly to the first_form.tmpl template
 */
define(['win', 'jquery', 'tpl/document', 'hideelem'], function (win, $, documentPage, hideElem) {
    'use strict';

    var lib = {};

    /**
     *
     */
    lib.bindClicks = function () {
        $('#save-options-button').on('click', function () {
            hideElem.redirectToSave(win.document.getElementById('mainform'), 'save_viewattrs');
        });
    };

    /**
     *
     * @param conf
     */
    lib.init = function (conf) {
        documentPage.init(conf);
        lib.bindClicks();
    };

    return lib;
});