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

/// <reference path="../../../ts/declarations/react.d.ts" />

import React from 'vendor/react';

import {init as initMediaViews} from './media';


export function init(dispatcher, mixins, lineStore, lineSelectionStore) {

    const mediaViews = initMediaViews(dispatcher, mixins, lineStore);

    // ------------------------- <ConcColsHeading /> ---------------------------

    let ConcColsHeading = React.createClass({

        _handleSetMainCorpClick : function (corpusId) {
            dispatcher.dispatch({
                actionType: 'CONCORDANCE_CHANGE_MAIN_CORPUS',
                props: {
                    maincorp: corpusId
                }
            });
        },

        _renderCol : function (corpInfo) {
            let colSpan = this.props.viewMode === 'kwic' ? 3 : 1;

            return [
                <td key={'ref:' + corpInfo.n}>{/* matches reference column */}</td>,
                <td key={corpInfo.n} className="concordance-col-heading" colSpan={colSpan}>
                    <a className="select-primary-lang" onClick={this._handleSetMainCorpClick.bind(this, corpInfo.n)}>{corpInfo.label}</a>
                </td>
            ];
        },

        render : function () {
            return (
                <tr>
                    <td>{/* matches line number column */}</td>
                    <td>{/* matches selection checkbox column */}</td>
                    <td>{/* matches syntax tree column */}</td>
                    {this.props.cols.map(item => this._renderCol(item))}
                </tr>
            );
        }

    });

    // ------------------------- <AudioLink /> ---------------------------

    let AudioLink = React.createClass({

        _getChar : function () {
            return {'L': '\u00A0[\u00A0', '+': '\u00A0+\u00A0', 'R': '\u00A0]\u00A0'}[this.props.t];
        },

        _handleClick : function () {
            dispatcher.dispatch({
                actionType: 'CONCORDANCE_PLAY_AUDIO_SEGMENT',
                props: {
                    chunks: this.props.chunks,
                    lineIdx: this.props.lineIdx
                }
            });
        },

        render : function () {
            if (this.props.chunks.length == 1
                    && this.props.chunks[this.props.chunks.length - 1].showAudioPlayer) {
                return (
                    <span>
                        <a className="speech-link" onClick={this._handleClick}>{this._getChar()}</a>
                        <mediaViews.AudioPlayer />
                    </span>
                );

            } else {
                return <a className="speech-link" onClick={this._handleClick}>{this._getChar()}</a>;
            }
        }
    });

    // ------------------------- <LineSelCheckbox /> ---------------------------

    let LineSelCheckbox = React.createClass({

        _checkboxChangeHandler : function (event) {
            this.setState({checked: !this.state.checked});
            dispatcher.dispatch({
                actionType: 'LINE_SELECTION_SELECT_LINE',
                props: {
                    value: event.currentTarget.checked ? 1 : null,
                    lineNumber: this.props.lineNumber,
                    tokenNumber: this.props.tokenNumber,
                    kwicLength: this.props.kwicLength
                }
            });
        },

        _handleStoreChange : function () {
            let tmp = lineSelectionStore.getLine(this.props.tokenNumber);
            this.setState({checked: tmp ? true : false});
        },

        componentDidMount : function () {
            lineSelectionStore.addChangeListener(this._handleStoreChange);
        },

        componentWillUnmount : function () {
            lineSelectionStore.removeChangeListener(this._handleStoreChange);
        },

        getInitialState : function () {
            let tmp = lineSelectionStore.getLine(this.props.tokenNumber);
            return {checked: tmp ? true : false};
        },

        shouldComponentUpdate : function (nextProps, nextState) {
            return this.state.checked !== nextState.checked;
        },

        render : function () {
            return <input type="checkbox" checked={this.state.checked}
                        onChange={this._checkboxChangeHandler} />;
        }
    });

    // ------------------------- <LineSelInput /> ---------------------------

    let LineSelInput = React.createClass({

        _textChangeHandler : function (event) {
            dispatcher.dispatch({
                actionType: 'LINE_SELECTION_SELECT_LINE',
                props: {
                    value: event.currentTarget.value ? Number(event.currentTarget.value) : -1,
                    lineNumber: this.props.lineNumber,
                    tokenNumber: this.props.tokenNumber,
                    kwicLength: this.props.kwicLength
                }
            });
        },

        _handleStoreChange : function () {
            let tmp = lineSelectionStore.getLine(this.props.tokenNumber);
            this.setState({value: tmp ? tmp[1] : ''});
        },

        componentDidMount : function () {
            lineSelectionStore.addChangeListener(this._handleStoreChange);
        },

        componentWillUnmount : function () {
            lineSelectionStore.removeChangeListener(this._handleStoreChange);
        },

        getInitialState : function () {
            let tmp = lineSelectionStore.getLine(this.props.tokenNumber);
            return {value: tmp ? tmp[1] : ''};
        },

        shouldComponentUpdate : function (nextProps, nextState) {
            return this.state.value !== nextState.value;
        },

        render : function () {
            return <input type="text" inputMode="numeric" style={{width: '1.4em'}}
                        value={this.state.value} onChange={this._textChangeHandler} />;
        }
    });

    // ------------------------- <TdLineSelection /> ---------------------------

    let TdLineSelection = React.createClass({

        _renderInput : function () {
            if (this.props.lockedGroupId) {
                return <span className="group-id">{this.props.lockedGroupId}</span>;

            } else if (this.props.mode === 'simple') {
                return <LineSelCheckbox {...this.props} />;

            } else if (this.props.mode === 'groups') {
                return <LineSelInput {...this.props} />;

            } else {
                return null;
            }
        },

        render : function () {
            return (
                <td className="manual-selection">
                    {this._renderInput()}
                </td>
            );
        }
    });

    // ------------------------- <Line /> ---------------------------

    let Line = React.createClass({

        mixins : mixins,


        _renderLeftChunk : function (item, i, itemList) {
            let ans = [];
            let mouseover = (item.mouseover || []).join(', ');
            if (i > 0 && itemList.get(i - 1).closeLink) {
                ans.push(<AudioLink t="+" lineIdx={this.props.lineIdx} corpname={this.props.baseCorpname}
                            chunks={[itemList.get(i - 1), item]} />);
            }
            if (item.openLink) {
                ans.push(<AudioLink t="L" lineIdx={this.props.lineIdx} corpname={this.props.baseCorpname}
                            chunks={[item]} />);
            }
            if (item.className && item.text) {
                ans.push(<span key={'l:' + String(i)} className={item.className}>{item.text}</span>);

            } else {
                ans.push(<span key={'l:' + String(i)} title={mouseover}>{item.text}</span>);
            }
            if (item.closeLink) {
                ans.push(<AudioLink t="R" lineIdx={this.props.lineIdx} corpname={this.props.baseCorpname}
                            chunks={[item]} />);
            }
            return ans;
        },

        _renderKwicChunk : function (prevBlockClosed, hasKwic, item, i, itemList) {
            const ans = [];
            const mouseover = (item.mouseover || []).join(', ');
            const prevClosed = i > 0 ? itemList.get(i - 1) : prevBlockClosed;
            if (prevClosed && item.openLink) {
                ans.push(<AudioLink t="+" lineIdx={this.props.lineIdx} corpname={this.props.baseCorpname}
                        chunks={[prevClosed, item]} />);

            } else if (i > 0 && itemList.get(i - 1).closeLink) {
                ans.push(<AudioLink t="+" lineIdx={this.props.lineIdx} corpname={this.props.baseCorpname}
                        chunks={[itemList.get(i - 1), item]} />);
            }
            if (hasKwic) {
                ans.push(<strong key={'k:' + String(i)} className={item.className} title={mouseover}>{item.text}</strong>);

            } else if (!item.text) {
                ans.push('<--not translated-->');

            } else {
                ans.push(item.text);
            }
            return ans;
        },

        _renderRightChunk : function (prevBlockClosed, item, i, itemList) {
            const ans = [];
            const mouseover = (item.mouseover || []).join(', ');
            const prevClosed = i > 0 ? itemList.get(i - 1) : prevBlockClosed;
            if (prevClosed && item.openLink) {
                ans.push(<AudioLink t="+" lineIdx={this.props.lineIdx} corpname={this.props.baseCorpname}
                            chunks={[prevClosed, item]} />);

            } else if (i > 0 && itemList.get(i - 1).closeLink) {
                ans.push(<AudioLink t="+" lineIdx={this.props.lineIdx} corpname={this.props.baseCorpname}
                            chunks={[itemList.get(i - 1), item]} />);
            }
            if (item.openLink) {
                ans.push(<AudioLink t="L" lineIdx={this.props.lineIdx} corpname={this.props.baseCorpname}
                            chunks={[item]} />);
            }
            if (item.className && item.text) {
                ans.push(<span key={'r:' + String(i)} className={item.className}>{item.text}</span>);

            } else {
                ans.push(<span key={'r:' + String(i)} title={mouseover}>{item.text}</span>);
            }
            if (item.closeLink) {
                ans.push(<AudioLink t="R" lineIdx={this.props.lineIdx} corpname={this.props.baseCorpname}
                            chunks={[item]} />);
            }
            return ans;
        },

        _exportTextElmClass : function (corpname, ...customClasses) {
            let ans = customClasses.slice();
            if (corpname === this.props.mainCorp) {
                ans.push('maincorp');
            }
            return ans.join(' ');
        },

        _renderTextKwicMode : function (corpname, corpusOutput) {
            let hasKwic = this.props.corpsWithKwic.indexOf(corpname) > -1;
            return [
                <td key="lc" className={this._exportTextElmClass(corpname, 'lc')}>
                    {corpusOutput.left.map(this._renderLeftChunk)}
                </td>,
                <td key="kw" className={this._exportTextElmClass(corpname, 'kw')}
                        onClick={this._handleKwicClick.bind(this, corpname,
                                 corpusOutput.tokenNumber, this.props.lineIdx)}>
                    {corpusOutput.kwic.map(this._renderKwicChunk.bind(this, corpusOutput.left.get(-1), hasKwic))}
                </td>,
                <td key="rc" className={this._exportTextElmClass(corpname, 'rc')}>
                    {corpusOutput.right.map(this._renderRightChunk.bind(this, corpusOutput.kwic.get(-1)))}
                </td>
            ];
        },

        _renderTextParMode : function (corpname, corpusOutput) {
            let hasKwic = this.props.corpsWithKwic.indexOf(corpname) > -1;
            return [
                <td key="par" className={this._exportTextElmClass(corpname, 'par')}
                        onClick={this._handleKwicClick.bind(this, corpname,
                                 corpusOutput.tokenNumber, this.props.lineIdx)}>
                    {corpusOutput.left.map(this._renderLeftChunk)}
                    {corpusOutput.kwic.map(this._renderKwicChunk.bind(this, corpusOutput.left.get(-1), hasKwic))}
                    {corpusOutput.right.map(this._renderRightChunk.bind(this, corpusOutput.kwic.get(-1)))}
                </td>
            ]
        },

        _renderText : function (corpusOutput, corpusIdx) {
            const corpname = this.props.cols[corpusIdx].n;

            const ans = [
                <td key="ref" className="ref" title={this.translate('concview__click_for_details')}
                        onClick={this._handleRefsClick.bind(this, corpname,
                                 corpusOutput.tokenNumber, this.props.lineIdx)}>
                    {corpusOutput.ref}
                </td>
            ];
            if (this.props.viewMode === 'kwic') {
                return ans.concat(this._renderTextKwicMode(corpname, corpusOutput));

            } else {
                return ans.concat(this._renderTextParMode(corpname, corpusOutput));
            }
        },

        _handleRefsClick : function (corpusId, tokenNumber, lineIdx) {
            this.props.refsDetailClickHandler(corpusId, tokenNumber, lineIdx);
        },

        _handleKwicClick : function (corpusId, tokenNumber, lineIdx) {
            this.props.concDetailClickHandler(corpusId, tokenNumber, lineIdx);
        },

        shouldComponentUpdate : function (nextProps, nextState) {
            return this.props.data !== nextProps.data
                    || this.props.lineSelMode !== nextProps.lineSelMode
                    || this.props.audioPlayerIsVisible !== nextProps.audioPlayerIsVisible;
        },

        render : function () {
            const primaryLang = this.props.data.languages.first();
            const alignedCorpora = this.props.data.languages.rest();
            const htmlClasses = [];
            if (this.props.data.hasFocus) {
                htmlClasses.push('active');
            }
            // NOTE: attributes "data-toknum" and "data-kwiclen" below
            // are used by non-react widgets (e.g. syntax viewer plug-in)
            return (
                <tr className={htmlClasses.join(' ')} data-toknum={primaryLang.tokenNumber} data-kwiclen={this.props.data.kwicLength}>
                    <td className="line-num">{this.props.showLineNumbers ? this.props.data.lineNumber + 1 : null}</td>
                    <TdLineSelection
                        kwicLength={this.props.data.kwicLength}
                        tokenNumber={primaryLang.tokenNumber}
                        lineNumber={this.props.data.lineNumber}
                        mode={this.props.lineSelMode}
                        lockedGroupId={this.props.numItemsInLockedGroups > 0 ? this.props.data.lineGroup : null} />
                    <td className="syntax-tree">
                    </td>
                    {this._renderText(primaryLang, 0)}
                    {alignedCorpora.map((alCorp, i) => this._renderText(alCorp, i + 1))}
                </tr>
            );
        }
    });

    // ------------------------- <ConcLines /> ---------------------------

    let ConcLines = React.createClass({

        mixins : mixins,

        _getLineSelMode : function () {
            if (lineStore.getNumItemsInLockedGroups() > 0) {
                return 'groups';

            } else {
                return lineSelectionStore.getMode();
            }
        },

        _storeChangeListener : function () {
            this.setState({
                lines: lineStore.getLines(),
                lineSelMode: this._getLineSelMode(),
                numItemsInLockedGroups: lineStore.getNumItemsInLockedGroups(),
                audioPlayerIsVisible: lineStore.audioPlayerIsVisible()
            });
        },

        getInitialState : function () {
            return {
                lines: lineStore.getLines(),
                lineSelMode: this._getLineSelMode(),
                numItemsInLockedGroups: lineStore.getNumItemsInLockedGroups(),
                audioPlayerIsVisible: lineStore.audioPlayerIsVisible()
            };
        },

        componentDidMount : function () {
            lineStore.addChangeListener(this._storeChangeListener);
            lineSelectionStore.addChangeListener(this._storeChangeListener);
            if (typeof this.props.onReady === 'function') { // <-- a glue with legacy dode
                this.props.onReady();
            }
        },

        componentWillUnmount : function () {
            lineStore.removeChangeListener(this._storeChangeListener);
            lineSelectionStore.removeChangeListener(this._storeChangeListener);
        },

        componentDidUpdate : function (prevProps, prevstate) {
            if (typeof this.props.onPageUpdate === 'function') {
                this.props.onPageUpdate();
            }
        },

        _renderLine : function (item, i) {
            return <Line key={String(i) + ':' + item.languages.first().tokenNumber}
                         lineIdx={i}
                         data={item}
                         cols={this.props.CorporaColumns}
                         viewMode={this.props.ViewMode}
                         baseCorpname={this.props.baseCorpname}
                         mainCorp={this.props.mainCorp}
                         corpsWithKwic={this.props.KWICCorps}
                         wideCtxGlobals={this.props.WideCtxGlobals}
                         showLineNumbers={this.props.ShowLineNumbers}
                         lineSelMode={this.state.lineSelMode}
                         numItemsInLockedGroups={this.state.numItemsInLockedGroups}
                         audioPlayerIsVisible={this.state.audioPlayerIsVisible}
                         concDetailClickHandler={this.props.concDetailClickHandler}
                         refsDetailClickHandler={this.props.refsDetailClickHandler} />;
        },

        render : function () {
            return (
                <table id="conclines">
                    <tbody>
                        {this.props.CorporaColumns.length > 1 ?
                            <ConcColsHeading cols={this.props.CorporaColumns} corpsWithKwic={this.props.KWICCorps}
                                    viewMode={this.props.ViewMode} />
                            : null
                        }
                        {this.state.lines.map(this._renderLine)}
                    </tbody>
                </table>
            );
        }
    });


    return {
        ConcLines: ConcLines
    };
}