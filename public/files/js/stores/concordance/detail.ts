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

/// <reference path="../../types/ajaxResponses.d.ts" />
/// <reference path="../../../ts/declarations/immutable.d.ts" />

import {SimplePageStore} from '../../util';
import {PageModel} from '../../tpl/document';
import {ConcLineStore} from './lines';
import {AudioPlayer} from './media';
import * as Immutable from 'vendor/immutable';

/**
 *
 */
export type ConcDetailText = Array<{str:string; class:string}>;


export type RGBColor = [number, number, number, number];

/**
 *
 */
export interface Speech {
    text:ConcDetailText;
    speakerId:string;
    segments:Immutable.List<string>;
    colorCode:RGBColor;
    metadata:Immutable.Map<string, string>;
}

/**
 * Note: A single speech line contains an array of
 * simultaneous speeches (i.e. if two people speak
 * at the same time then the array contains two items).
 */
export type SpeechLine = Array<Speech>;

export type SpeechLines = Array<SpeechLine>;


type ExpandArgs = [number, number];


export interface SpeechOptions {
    speakerIdAttr:[string, string];
    speechSegment:[string, string];
    speechAttrs:Array<string>;
    speechOverlapAttr:[string, string];
    speechOverlapVal:string;
}

function importColor(color:string, opacity:number):RGBColor {
    const fromHex = pos => parseInt(color.substr(2 * pos + 1, 2), 16);
    if (color.substr(0, 1) === '#') {
        return [
            fromHex(0),
            fromHex(1),
            fromHex(2),
            parseFloat(opacity.toFixed(1))
        ];

    } else if (color.toLowerCase().indexOf('rgb') === 0) {
        const srch = /rgb\((\d+),\s*(\d+),\s*(\d+)\s*(,\s*[\d\.]+)*\)/i.exec(color);
        if (srch) {
            return [
                parseInt(srch[1]),
                parseInt(srch[2]),
                parseInt(srch[3]),
                parseFloat(opacity.toFixed(1))
            ];

        } else {
            throw new Error('Cannot import color ' + color);
        }

    } else {
        throw new Error('Cannot import color ' + color);
    }
}

/**
 * A store providing access to a detailed/extended kwic information.
 */
export class ConcDetailStore extends SimplePageStore {

    private static SPK_LABEL_OPACITY:number = 0.8;

    private layoutModel:PageModel;

    private linesStore:ConcLineStore;

    private concDetail:ConcDetailText;

    private expandLeftArgs:Immutable.List<ExpandArgs>;

    private expandRightArgs:Immutable.List<ExpandArgs>;

    private corpusId:string;

    private tokenNum:number;

    private lineIdx:number;

    private wholeDocumentLoaded:boolean;

    private structCtx:string;

    private speechOpts:SpeechOptions;

    private speechAttrs:Array<string>;

    private audioPlayer:AudioPlayer;

    private speakerColors:Immutable.List<RGBColor>;

    /**
     * Speaker colors attachments must survive context expansion.
     * Otherwise it would confusing if e.g. green speaker '01'
     * changed into red one after a context expasion due to
     * some new incoming or outcoming users.
     */
    private speakerColorsAttachments:Immutable.Map<string, RGBColor>;


    constructor(layoutModel:PageModel, dispatcher:Dispatcher.Dispatcher<any>, linesStore:ConcLineStore, structCtx:string,
            speechOpts:SpeechOptions, speakerColors:Array<string>) {
        super(dispatcher);
        const self = this;
        this.layoutModel = layoutModel;
        this.linesStore = linesStore;
        this.structCtx = structCtx;
        this.speechOpts = speechOpts;
        this.speechAttrs = speechOpts.speechAttrs;
        this.lineIdx = null;
        this.wholeDocumentLoaded = false;
        this.speakerColors = Immutable.List<RGBColor>(speakerColors.map(item => importColor(item, ConcDetailStore.SPK_LABEL_OPACITY)));
        this.speakerColorsAttachments = Immutable.Map<string, RGBColor>();
        this.expandLeftArgs = Immutable.List<ExpandArgs>();
        this.expandRightArgs = Immutable.List<ExpandArgs>();
        this.audioPlayer = new AudioPlayer(
            this.layoutModel.createStaticUrl('misc/soundmanager2/'),
            () => {
                this.notifyChangeListeners();
            },
            () => {}, // TODO
            () => {
                this.audioPlayer.stop();
                this.layoutModel.showMessage('error',
                        this.layoutModel.translate('concview__failed_to_play_audio'));
            }
        );

        this.dispatcher.register(function (payload:Kontext.DispatcherPayload) {
            switch (payload.actionType) {
                case 'CONCORDANCE_EXPAND_KWIC_DETAIL':
                    self.loadConcDetail(
                            self.corpusId,
                            self.tokenNum,
                            self.lineIdx,
                            [],
                            payload.props['position']).then(
                        () => {
                            self.linesStore.setLineFocus(self.lineIdx, true);
                            self.linesStore.notifyChangeListeners();
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.layoutModel.showMessage('error', err);
                        }
                    );
                break;
                case 'CONCORDANCE_SHOW_KWIC_DETAIL':
                    self.loadConcDetail(
                            payload.props['corpusId'],
                            payload.props['tokenNumber'],
                            payload.props['lineIdx'],
                            [],
                            self.expandLeftArgs.size > 1 && self.expandRightArgs.size > 1 ? 'reload' : null).then(
                        () => {
                            self.linesStore.setLineFocus(payload.props['lineIdx'], true);
                            self.linesStore.notifyChangeListeners();
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.layoutModel.showMessage('error', err);
                        }
                    );
                break;
                case 'CONCORDANCE_SHOW_WHOLE_DOCUMENT':
                    self.loadWholeDocument().then(
                        () => {
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.layoutModel.showMessage('error', err);
                        }
                    );
                break;
                case 'CONCORDANCE_SHOW_SPEECH_DETAIL':
                    self.speakerColorsAttachments = self.speakerColorsAttachments.clear();
                    self.loadSpeechDetail(
                            payload.props['corpusId'],
                            payload.props['tokenNumber'],
                            payload.props['lineIdx'],
                            self.expandLeftArgs.size > 1 && self.expandRightArgs.size > 1 ? 'reload' : null).then(
                        () => {
                            self.linesStore.setLineFocus(payload.props['lineIdx'], true);
                            self.linesStore.notifyChangeListeners();
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.layoutModel.showMessage('error', err);
                        }
                    );
                break;
                case 'CONCORDANCE_EXPAND_SPEECH_DETAIL':
                    self.loadSpeechDetail(
                            self.corpusId,
                            self.tokenNum,
                            self.lineIdx,
                            payload.props['position']).then(
                        () => {
                            self.linesStore.setLineFocus(self.lineIdx, true);
                            self.linesStore.notifyChangeListeners();
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.layoutModel.showMessage('error', err);
                        }
                    );
                break;
                case 'CONCORDANCE_RESET_DETAIL':
                    if (self.lineIdx !== null) {
                        self.linesStore.setLineFocus(self.lineIdx, false);
                        self.lineIdx = null;
                        self.corpusId = null;
                        self.tokenNum = null;
                        self.wholeDocumentLoaded = false;
                        self.expandLeftArgs = self.expandLeftArgs.clear();
                        self.expandRightArgs = self.expandRightArgs.clear();
                        self.speakerColorsAttachments = self.speakerColorsAttachments.clear();
                        self.notifyChangeListeners();
                        self.linesStore.notifyChangeListeners();
                    }
                break;
                case 'CONCORDANCE_PLAY_SPEECH':
                    self.audioPlayer.start(
                        (<Immutable.List<string>>payload.props['segments']).map(item => {
                            return self.layoutModel.createActionUrl(`audio?corpname=${self.corpusId}&chunk=${item}`);
                        }).toArray()
                    );
                break;
            }
        });
    }

    getConcDetail():ConcDetailText {
        return this.concDetail;
    }

    getSpeechesDetail():SpeechLines {
        const self = this;
        let spkId = null;

        function parseTag(name:string, s:string):{[key:string]:string} {
            const srch = new RegExp(`<${name}(\\s+.*)>`).exec(s);
            if (srch) {
                const ans:{[key:string]:string} = {};
                srch[1].trim().split(/\s+/)
                    .map(item => new RegExp('([a-zA-Z0-9_]+)=([^\\s^>]+)').exec(item))
                    .filter(item => !!item)
                    .forEach(item => {
                        ans[item[1]] = item[2];
                    });
                return ans;
            }
            return null;
        }

        function createNewSpeech(speakerId:string, colorCode:RGBColor, metadata:{[attr:string]:string}):Speech {
            const importedMetadata = Immutable.Map<string, string>(metadata)
                    .filter((val, attr) => attr !== self.speechOpts.speechSegment[1] &&
                                attr !== self.speechOpts.speakerIdAttr[1])
                    .toMap();
            return {
                text: [],
                speakerId: speakerId,
                segments: Immutable.List<string>(),
                metadata: importedMetadata,
                colorCode: colorCode
            };
        }

        function isOverlap(s1:Speech, s2:Speech):boolean {
            if (s1 && s2) {
                const flag1 = s1.metadata.get(self.speechOpts.speechOverlapAttr[1]);
                const flag2 = s2.metadata.get(self.speechOpts.speechOverlapAttr[1]);
                if (flag1 === flag2
                        && flag2 === self.speechOpts.speechOverlapVal
                        && s1.segments.get(0) === s2.segments.get(0)) {
                    return true;
                }
            }
            return false;
        }

        function mergeOverlaps(speeches:Array<Speech>):SpeechLines {
            const ans:SpeechLines = [];
            let prevSpeech:Speech = null;
            speeches.forEach((item, i) => {
                if (isOverlap(prevSpeech, item)) {
                    ans[ans.length - 1].push(item);
                    ans[ans.length - 1] = ans[ans.length - 1].sort((s1, s2) => {
                        if (s1.speakerId > s2.speakerId) {
                            return 1;

                        } else if (s1.speakerId < s2.speakerId) {
                            return -1;

                        } else {
                            return 0;
                        }
                    });

                } else {
                    ans.push([item]);
                }
                prevSpeech = item;
            });
            return ans;
        }

        let currSpeech:Speech = createNewSpeech('\u2026', null, {});
        let prevSpeech:Speech = null;
        const tmp:Array<Speech> = [];
        this.concDetail.forEach((item, i) => {
            if (item.class === 'strc') {
                const attrs = parseTag(this.speechOpts.speakerIdAttr[0], item.str);
                if (attrs !== null && attrs[this.speechOpts.speakerIdAttr[1]]) {
                        tmp.push(currSpeech);
                        const newSpeakerId = attrs[this.speechOpts.speakerIdAttr[1]];
                        if (!this.speakerColorsAttachments.has(newSpeakerId)) {
                            this.speakerColorsAttachments = this.speakerColorsAttachments.set(
                                newSpeakerId, this.speakerColors.get(this.speakerColorsAttachments.size)
                            )
                        }
                        prevSpeech = currSpeech;
                        currSpeech = createNewSpeech(
                            newSpeakerId,
                            this.speakerColorsAttachments.get(newSpeakerId),
                            attrs
                        );
                }
                if (item.str.indexOf(`<${this.speechOpts.speechSegment[0]}`) > -1) {
                    const attrs = parseTag(this.speechOpts.speechSegment[0], item.str);
                    if (attrs) {
                        currSpeech.segments = currSpeech.segments.push(attrs[this.speechOpts.speechSegment[1]]);
                    }
                }

            } else {
                currSpeech.text.push({
                    str: item.str,
                    class: item.class
                });
            }
        });
        if (currSpeech.text.length > 0) {
            tmp.push(currSpeech);
        }
        return mergeOverlaps(tmp);
    }

    private loadWholeDocument():RSVP.Promise<any> {

        return this.layoutModel.ajax<AjaxResponse.WideCtx>(
            'GET',
            this.layoutModel.createActionUrl('structctx'),
            {
                corpname: this.corpusId,
                pos: this.tokenNum,
                struct: this.structCtx
            },
            {}

        ).then(
            (data) => {
                if (!data.contains_errors) {
                    this.concDetail = data.content;
                    this.wholeDocumentLoaded = true;
                    this.expandLeftArgs = Immutable.List<ExpandArgs>();
                    this.expandRightArgs = Immutable.List<ExpandArgs>();

                } else {
                    throw new Error(data.messages[0]);
                }
            }
        );
    }

    private loadSpeechDetail(corpusId:string, tokenNum:number, lineIdx:number, expand?:string):RSVP.Promise<any> {
        const args = this.speechAttrs.map(x => `${this.speechOpts.speakerIdAttr[0]}.${x}`)
                .concat([this.speechOpts.speechSegment.join('.')]);
        return this.loadConcDetail(corpusId, tokenNum, lineIdx, args, expand);
    }

    private loadConcDetail(corpusId:string, tokenNum:number, lineIdx:number, structs:Array<string>, expand?:string):RSVP.Promise<any> {
        this.corpusId = corpusId;
        this.tokenNum = tokenNum;
        this.lineIdx = lineIdx;
        this.wholeDocumentLoaded = false;

        const args = this.layoutModel.getConcArgs().toDict();
        args['corpname'] = corpusId; // just for sure (is should be already in args)
        // we must delete 'usesubcorp' as the server API does not need it
        // and in case of an aligned corpus it even produces an error
        delete args['usesubcorp'];
        args['pos'] = String(tokenNum);
        args['format'] = 'json'

        if (structs) {
            args['structs'] = (args['structs'] || '').split(',').concat(structs).join(',');
        }

        if (expand === 'left') {
            args['detail_left_ctx'] = String(this.expandLeftArgs.get(-1)[0]);
            args['detail_right_ctx'] = String(this.expandLeftArgs.get(-1)[1]);

        } else if (expand === 'right') {
            args['detail_left_ctx'] = String(this.expandRightArgs.get(-1)[0]);
            args['detail_right_ctx'] = String(this.expandRightArgs.get(-1)[1]);


        } else if (expand === 'reload' && this.expandLeftArgs.size > 1
                && this.expandRightArgs.size > 1) {
            // Please note that the following lines do not contain any 'left - right'
            // mismatch as we have to fetch the 'current' state, not the 'next' one and such
            // info is always on the other side of expansion (expand-left contains
            // also current right and vice versa)
            args['detail_left_ctx'] = String(this.expandRightArgs.get(-1)[0]);
            args['detail_right_ctx'] = String(this.expandLeftArgs.get(-1)[1]);
        }

        return this.layoutModel.ajax<AjaxResponse.WideCtx>(
            'GET',
            this.layoutModel.createActionUrl('widectx'),
            args,
            {}

        ).then(
            (data) => {
                if (!data.contains_errors) {
                    this.concDetail = data.content;
                    if (data.expand_left_args) {
                        this.expandLeftArgs = this.expandLeftArgs.push([
                            data.expand_left_args.detail_left_ctx, data.expand_left_args.detail_right_ctx
                        ]);

                    } else {
                        this.expandLeftArgs = this.expandLeftArgs.push(null);
                    }
                    if (data.expand_right_args) {
                        this.expandRightArgs = this.expandRightArgs.push([
                            data.expand_right_args.detail_left_ctx, data.expand_right_args.detail_right_ctx
                        ]);

                    } else {
                        this.expandRightArgs = this.expandRightArgs.push(null);
                    }

                } else {
                    throw new Error(data.messages[0]);
                }
            }
        );
    }

    hasExpandLeft():boolean {
        return !!this.expandLeftArgs.get(-1);
    }

    hasExpandRight():boolean {
        return !!this.expandRightArgs.get(-1);
    }

    canDisplayWholeDocument():boolean {
        return this.structCtx && !this.wholeDocumentLoaded;
    }
}


export interface RefsColumn {
    name:string;
    val:string;
}

/**
 * Store providing structural attribute information (aka "text types") related to a specific token
 */
export class RefsDetailStore extends SimplePageStore {

    private layoutModel:PageModel;

    private data:Array<RefsColumn>;

    private linesStore:ConcLineStore;

    private lineIdx:number;

    constructor(layoutModel:PageModel, dispatcher:Dispatcher.Dispatcher<any>, linesStore:ConcLineStore) {
        super(dispatcher);
        const self = this;
        this.layoutModel = layoutModel;
        this.linesStore = linesStore;
        this.lineIdx = null;

        this.dispatcher.register(function (payload:Kontext.DispatcherPayload) {
            switch (payload.actionType) {
                case 'CONCORDANCE_SHOW_REF_DETAIL':
                    self.loadRefs(payload.props['corpusId'], payload.props['tokenNumber'], payload.props['lineIdx']).then(
                        () => {
                            self.linesStore.setLineFocus(payload.props['lineIdx'], true);
                            self.linesStore.notifyChangeListeners();
                            self.notifyChangeListeners();
                        },
                        (err) => {
                            self.layoutModel.showMessage('error', err);
                            self.notifyChangeListeners();
                        }
                    );
                break;
                case 'CONCORDANCE_REF_RESET_DETAIL':
                    if (self.lineIdx !== null) {
                        self.linesStore.setLineFocus(self.lineIdx, false);
                        self.lineIdx = null;
                        self.notifyChangeListeners();
                        self.linesStore.notifyChangeListeners();
                    }
                break;
            }
        });
    }

    getData():Array<[RefsColumn, RefsColumn]> {
        const ans:Array<[RefsColumn, RefsColumn]> = [];
        for (let i = 0; i < this.data.length; i += 2) {
            ans.push([this.data[i], this.data[i+1]]);
        }
        return ans;
    }

    private loadRefs(corpusId:string, tokenNum:number, lineIdx:number):RSVP.Promise<any> {
        return this.layoutModel.ajax<AjaxResponse.FullRef>(
            'GET',
            this.layoutModel.createActionUrl('fullref'),
            {corpname: corpusId, pos: tokenNum},
            {
                contentType : 'application/x-www-form-urlencoded',
                accept: 'application/json'
            }

        ).then(
            (data) => {
                if (!data.contains_errors) {
                    this.lineIdx = lineIdx;
                    this.data = data.Refs;

                } else {
                    throw new Error('Invalid response');
                }
            }
        );
    }
}
