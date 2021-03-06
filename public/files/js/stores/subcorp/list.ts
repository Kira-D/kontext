/*
 * Copyright (c) 2016 Charles University in Prague, Faculty of Arts,
 *                    Institute of the Czech National Corpus
 * Copyright (c) 2016 Tomas Machalek <tomas.machalek@gmail.com>
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

/// <reference path="../../../ts/declarations/flux.d.ts" />
/// <reference path="../../../ts/declarations/immutable.d.ts" />
/// <reference path="../../../ts/declarations/rsvp.d.ts" />

/// <reference path="../../types/common.d.ts" />
/// <reference path="../../types/ajaxResponses.d.ts" />


import * as Immutable from 'vendor/immutable';
import * as RSVP from 'vendor/rsvp';

import {PageModel} from '../../tpl/document';
import {SimplePageStore} from '../../util';


export interface SubcorpListItem {
    name:string;
    corpname:string;
    usesubcorp:string;
    deleted:boolean;
    created:Date;
    cql:string;
    size:number;
    selected:boolean;
}

export interface UnfinishedSubcorp {
    ident:string;
    name:string;
    created:Date;
}

export interface SortKey {
    name:string;
    reverse:boolean;
}

export class SubcorpListStore extends SimplePageStore {

    private layoutModel:PageModel;

    private lines:Immutable.List<SubcorpListItem>;

    private unfinished:Immutable.List<UnfinishedSubcorp>;

    private relatedCorpora:Immutable.List<string>;

    private sortKey:SortKey;

    private filter:Kontext.SubcListFilter;

    constructor(dispatcher:Dispatcher.Dispatcher<any>, layoutModel:PageModel,
            data:Array<AjaxResponse.ServerSubcorpListItem>, sortKey:SortKey,
            relatedCorpora:Array<string>,
            unfinished:Array<Kontext.AsyncTaskInfo>,
            initialFilter:Kontext.SubcListFilter) {
        super(dispatcher);
        this.layoutModel = layoutModel;
        this.importLines(data);
        this.importUnfinished(unfinished);
        this.relatedCorpora = Immutable.List<string>(relatedCorpora);
        this.sortKey = sortKey;
        this.filter = initialFilter || {show_deleted: false, corpname: ''};

        this.layoutModel.addOnAsyncTaskUpdate((itemList) => {
            if (itemList.filter(item => item.category == 'subcorpus').size > 0) {
                this.reloadItems().then(
                    (data) => {
                        this.notifyChangeListeners();
                    },
                    (err) => {
                        this.notifyChangeListeners();
                        this.layoutModel.showMessage('error', err);
                    }
                )
            }
        });

        const self = this;
        this.dispatcher.register(function (payload:Kontext.DispatcherPayload) {
            switch (payload.actionType) {
                case 'SUBCORP_LIST_SELECT_LINE':
                    self.selectLine(payload.props['idx']);
                    self.notifyChangeListeners();
                break;
                case 'SUBCORP_LIST_SORT_LINES':
                    self.sortItems(payload.props['colName'], payload.props['reverse']).then(
                        (data) => {
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.notifyChangeListeners();
                            self.layoutModel.showMessage('error', err);
                        }
                    )
                break;
                case 'SUBCORP_LIST_DELETE_SELECTED_SUBCORPORA':
                    self.deleteSelectedSubcorpora().then(
                        (data) => {
                            self.notifyChangeListeners();
                            self.layoutModel.showMessage(
                                'info',
                                self.layoutModel.translate('subclist__sel_subcorpora_deleted')
                            );
                        },
                        (err) => {
                            self.notifyChangeListeners();
                            self.layoutModel.showMessage('error', err);
                        }
                    );
                break;
                case 'SUBCORP_LIST_UPDATE_FILTER':
                    self.filterItems(<Kontext.SubcListFilter>payload.props).then(
                        (data) => {
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.notifyChangeListeners();
                            self.layoutModel.showMessage('error', err);
                        }
                    )
                break;
                case 'SUBCORP_LIST_WIPE_SUBCORPUS':
                    self.wipeSubcorpus(payload.props['idx']).then(
                        (data) => {
                            self.layoutModel.showMessage('info',
                                    self.layoutModel.translate('subclist__subc_wipe_confirm_msg'));
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.layoutModel.showMessage('error', err);
                            self.notifyChangeListeners();
                        }
                    );
                break;
                case 'SUBCORP_LIST_RESTORE_SUBCORPUS':
                    self.createSubcorpus(payload.props['idx']).then(
                        (data) => {
                            self.layoutModel.showMessage('info',
                                    self.layoutModel.translate('subclist__subc_restore_confirm_msg'));
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.layoutModel.showMessage('error', err);
                            self.notifyChangeListeners();
                        }
                    );
                break;
                case 'SUBCORP_LIST_REUSE_QUERY':
                    self.createSubcorpus(payload.props['idx'], payload.props['newName'], payload.props['newCql']).then(
                        (data) => {
                            self.layoutModel.showMessage('info',
                                    self.layoutModel.translate('subclist__subc_reuse_confirm_msg'));
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.layoutModel.showMessage('error', err);
                            self.notifyChangeListeners();
                        }
                    );
                break;
            }
        });
    }

    private createSubcorpus(idx:number, subcname?:string, cql?:string):RSVP.Promise<any> {
        const srcRow = this.lines.get(idx);
        const params = {
            corpname: srcRow.corpname,
            subcname: subcname !== undefined ? subcname : srcRow.usesubcorp,
            cql: cql !== undefined ? cql : srcRow.cql
        };
        return this.layoutModel.ajax<AjaxResponse.CreateSubcorpus>(
            'POST',
            this.layoutModel.createActionUrl('subcorpus/ajax_create_subcorpus'),
            params,
            {contentType : 'application/x-www-form-urlencoded'}

        ).then(
            (data) => {
                data.unfinished_subc.forEach(item => {
                    this.layoutModel.registerTask({
                        ident: item.ident,
                        label: item.label,
                        category: item.category,
                        status: item.status,
                        created: item.created,
                        error: item.error,
                        args: item.args
                    });
                    this.unfinished = this.unfinished.push({
                        ident: item.ident,
                        name: item.label,
                        created: new Date(item.created * 1000)
                    });
                    this.lines = this.lines.remove(idx);
                });
                if (data.unfinished_subc.length > 0) {
                    return new RSVP.Promise((resolve:(v:any)=>void, reject:(e:any)=>void) => {
                        resolve(null);
                    });

                } else {
                    return this.reloadItems();
                }
            }
        );
    }

    private wipeSubcorpus(lineIdx:number):RSVP.Promise<any> {
        const delRow = this.lines.get(lineIdx);
        return this.layoutModel.ajax(
            'POST',
            this.layoutModel.createActionUrl('subcorpus/ajax_wipe_subcorpus'),
            {
                corpname: delRow.corpname,
                subcname: delRow.usesubcorp
            },
            {contentType : 'application/x-www-form-urlencoded'}

        ).then(
            (data) => {
                this.lines = this.lines.remove(lineIdx);
                return data;
            }
        );
    }

    private importLines(data:Array<AjaxResponse.ServerSubcorpListItem>):void {
        this.lines = Immutable.List<SubcorpListItem>(data.map<SubcorpListItem>(item => {
            return {
                name: decodeURIComponent(item.name),
                corpname: item.corpname,
                usesubcorp: decodeURIComponent(item.usesubcorp),
                deleted: item.deleted,
                size: item.size,
                cql: item.cql ? decodeURIComponent(item.cql).trim() : undefined,
                created: new Date(item.created * 1000),
                selected: false
            }
        }));
    }

    private importUnfinished(data:Array<Kontext.AsyncTaskInfo>):void {
        this.unfinished = Immutable.List<UnfinishedSubcorp>(data.map<UnfinishedSubcorp>(item => {
            return {
                ident: item.ident,
                name: item.label,
                created: new Date(item.created * 1000)
            }
        }));
    }

    private deleteSelectedSubcorpora():RSVP.Promise<any> {
        const selSubc = this.lines.filter(item => item.selected).map(item => {
            return {
                corpname: item.corpname,
                subcname: item.usesubcorp
            };
        });
        return this.layoutModel.ajax<Kontext.AjaxResponse>(
            'POST',
            this.layoutModel.createActionUrl('subcorpus/delete'),
            selSubc,
            {
                contentType : 'application/json'
            }
        ).then(
            (data) => {
                if (data.contains_errors) {
                    throw new Error(data.messages[0]);

                } else {
                    return this.reloadItems();
                }
            }
        );
    }

    private sortItems(name:string, reverse:boolean):RSVP.Promise<any> {
        const args:{[key:string]:string} = {
            format: 'json',
            sort: (reverse ? '-' : '') + name
        }
        this.mergeFilter(args, this.filter);

        return this.layoutModel.ajax<AjaxResponse.SubcorpList>(
            'GET',
            this.layoutModel.createActionUrl('subcorpus/subcorp_list'),
            args,
            { contentType : 'application/x-www-form-urlencoded' }

        ).then(
            (data) => {
                if (data.contains_errors) {
                    throw new Error(data.messages[0]);

                } else {
                    this.importLines(data.subcorp_list);
                    this.importUnfinished(data.unfinished_subc);
                    this.relatedCorpora = Immutable.List<string>(data.related_corpora);
                    this.sortKey = {
                        name: data.sort_key.name,
                        reverse: data.sort_key.reverse
                    };
                }
            }
        );
    }

    private mergeFilter(currArgs:{[key:string]:string}, filter:Kontext.SubcListFilter):void {
        function exportVal(v) {
            if (typeof v === 'boolean') {
                return v ? '1' : '0';
            }
            return String(v);
        }
        for (let p in filter) {
            if (filter.hasOwnProperty(p)) {
                currArgs[p] = exportVal(filter[p]);
            }
        }
    }

    private reloadItems():RSVP.Promise<any> {
        return this.filterItems(this.filter);
    }

    private filterItems(filter:Kontext.SubcListFilter):RSVP.Promise<any> {
        const args:{[key:string]:string} = {
            format: 'json',
            sort: (this.sortKey.reverse ? '-' : '') + this.sortKey.name,
        }
        this.mergeFilter(args, filter);
        return this.layoutModel.ajax<AjaxResponse.SubcorpList>(
            'GET',
            this.layoutModel.createActionUrl('subcorpus/subcorp_list'),
            args,
            { contentType : 'application/x-www-form-urlencoded' }

        ).then(
            (data) => {
                if (data.contains_errors) {
                    throw new Error(data.messages[0]);

                } else {
                    this.importLines(data.subcorp_list);
                    this.importUnfinished(data.unfinished_subc);
                    this.relatedCorpora = Immutable.List<string>(data.related_corpora);
                    for (let p in filter) {
                        if (filter.hasOwnProperty(p)) {
                            this.filter[p] = filter[p];
                        }
                    }
                }
            }
        );
    }

    private selectLine(idx:number):void {
        const line = this.lines.get(idx);
        this.lines = this.lines.set(idx, {
            corpname: line.corpname,
            cql: line.cql,
            created: line.created,
            deleted: line.deleted,
            name: line.name,
            selected: !line.selected,
            size: line.size,
            usesubcorp: line.usesubcorp
        });
    }

    getLines():Immutable.List<SubcorpListItem> {
        return this.lines;
    }

    getSortKey():SortKey {
        return this.sortKey;
    }

    hasSelectedLines():boolean {
        return this.lines.find(item => item.selected) !== undefined;
    }

    getFilter():any {
        return this.filter;
    }

    getUnfinished():Immutable.List<UnfinishedSubcorp> {
        return this.unfinished;
    }

    getRow(num:number):SubcorpListItem {
        return this.lines.get(num);
    }

    getRelatedCorpora():Immutable.List<string> {
        return this.relatedCorpora;
    }
}

