/*
 * Copyright (c) 2013 Institute of the Czech National Corpus
 * Copyright (c) 2003-2009  Pavel Rychly
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
 * This module contains functionality related directly to the filter_form.tmpl template
 *
 */
define(['jquery', 'tpl/document', 'bonito'], function ($, mainPage, bonito) {
    'use strict';

    var lib = {};

    /**
     *
     */
    lib.bindClicks = function () {

        $('#text-type-el-link').on('click', function (event) {
            bonito.toggleViewStore('texttypeel', null, mainPage.userSettings);
            $(event.target).toggleClass('toggled');
        });
    };

    /**
     *
     * @param conf page configuration data
     */
    lib.init = function (conf) {
        mainPage.init(conf);
        lib.bindClicks();
    };

    return lib;
});