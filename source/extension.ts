import * as vscode from 'vscode';
import * as vscel from '@wraith13/vscel';
import packageJson from "../package.json";
const profile = vscel.profiler.profile;
module Config
{
    export const root = vscel.config.makeRoot(packageJson);
    export const enabled = root.makeEntry<boolean>("aggressiveAutoJson.enabled");
    export const debug = root.makeEntry<boolean>("aggressiveAutoJson.debug");
    export const autoAddComma = root.makeEntry<boolean>("aggressiveAutoJson.autoAddComma");
    export const autoRemoveComma = root.makeEntry<boolean>("aggressiveAutoJson.autoRemoveComma");
    export const autoAddColon = root.makeEntry<boolean>("aggressiveAutoJson.autoAddColon");
}
let isMutedAll: boolean | undefined = undefined;
const debug = (output: any) =>
{
    if (Config.debug.get(""))
    {
        console.debug(output);
    }
};
class DocumentFormatCacheEntry
{
    isMuted: boolean | undefined;
    public constructor(document: vscode.TextDocument)
    {
        documentFormatCache.set(document, this);
    }
}
const documentFormatCache = new Map<vscode.TextDocument, DocumentFormatCacheEntry>();
const makeSureDocumentFormatCache = (document: vscode.TextDocument) =>
    documentFormatCache.get(document) ?? new DocumentFormatCacheEntry(document);
export const regExpExecToArray = (regexp: RegExp, text: string) => profile
(
    `regExpExecToArray(/${regexp.source}/${regexp.flags})`,
    () =>
    {
        const result: RegExpExecArray[] = [];
        while(true)
        {
            const match = regexp.exec(text);
            if (null === match)
            {
                break;
            }
            result.push(match);
        }
        return result;
    }
);
const makeRegExpPart = (text: string) => text.replace(/([\\\/\*\[\]\(\)\{\}\|])/gmu, "\\$1").replace(/\s+/, "\\s");
const parseJSON = (document: vscode.TextDocument) => profile
(
    "parseJSON",
    (): BracketEntry[] =>
    {
        const result:BracketEntry[] = [];
        const languageConfiguration = Config.languageConfiguration.get(document.languageId);
        const regulate = languageConfiguration.ignoreCase ?
            (text: string) => text.replace(/\s+/, " ").toLowerCase():
            (text: string) => text.replace(/\s+/, " ");
        const openingBlockComments = languageConfiguration.comments?.block?.map(i => regulate(i.opening)) ?? [];
        const closingBlockComments = languageConfiguration.comments?.block?.map(i => regulate(i.closing)) ?? [];
        const lineComments = languageConfiguration.comments?.line?.map(regulate) ?? [];
        const openingSymbolBrackets = languageConfiguration.brackets?.symbol?.map(i => regulate(i.opening)) ?? [];
        const symbolBracketInters = languageConfiguration.brackets?.symbol?.map(i => i.inters?.map(regulate) ?? [])?.reduce((a, b) => a.concat(b), []) ?? [];
        const closingSymbolBrackets = languageConfiguration.brackets?.symbol?.map(i => regulate(i.closing)) ?? [];
        const symbolBracketsHeader = languageConfiguration.brackets?.symbol?.map(i => i.headerMode ?? "smart") ?? [];
        const openingWordBrackets = languageConfiguration.brackets?.word?.map(i => regulate(i.opening)) ?? [];
        const wordBracketInters = languageConfiguration.brackets?.word?.map(i => i.inters?.map(regulate) ?? [])?.reduce((a, b) => a.concat(b), []) ?? [];
        const closingWordBrackets = languageConfiguration.brackets?.word?.map(i => regulate(i.closing)) ?? [];
        const wordBracketsHeader = languageConfiguration.brackets?.word?.map(i => i.headerMode ?? "inner") ?? [];
        const openingInlineStrings = languageConfiguration.strings?.inline?.map(i => regulate(i.opening)) ?? [];
        const escapeInlineStrings = languageConfiguration.strings?.inline?.map(i => regulate(i.escape)) ?? [];
        const closingInlineStrings = languageConfiguration.strings?.inline?.map(i => regulate(i.closing)) ?? [];
        const openingMultilineStrings = languageConfiguration.strings?.multiline?.map(i => regulate(i.opening)) ?? [];
        const escapeMultilineStrings = languageConfiguration.strings?.multiline?.map(i => regulate(i.escape)) ?? [];
        const closingMultilineStrings = languageConfiguration.strings?.multiline?.map(i => regulate(i.closing)) ?? [];
        const pattern = (<string[]>[])
            .concat(openingBlockComments)
            .concat(closingBlockComments)
            .concat(lineComments)
            .concat(openingSymbolBrackets)
            .concat(symbolBracketInters)
            .concat(closingSymbolBrackets)
            .concat(openingWordBrackets)
            .concat(wordBracketInters)
            .concat(closingWordBrackets)
            .concat(openingInlineStrings)
            .concat(escapeInlineStrings)
            .concat(closingInlineStrings)
            .concat(openingMultilineStrings)
            .concat(escapeMultilineStrings)
            .concat(closingMultilineStrings)
            .filter((entry, index, array) => "" !== entry && index === array.indexOf(entry))
            .map(i => `${makeRegExpPart(i)}`)
            .join("|");
        const text = document.getText();
        const tokens = regExpExecToArray
        (
            new RegExp
            (
                pattern,
                languageConfiguration.ignoreCase ?
                    "gui":
                    "gu"
            ),
            text
        )
        .map
        (
            match =>
            ({
                index: match.index,
                token: match[0],
            })
        );
        const getCharactoer = (index: number) => index < 0 ? "":
            document.getText
            (
                new vscode.Range
                (
                    document.positionAt(index),
                    document.positionAt(index +1)
                )
            );
        const isIncludeWord = (text: string) => text.replace(/\w/, "").length < text.length;
        const isSureMatchWord = (match: { index: number, token: string}) =>
            !isIncludeWord(getCharactoer(match.index -1)) &&
            !isIncludeWord(getCharactoer(match.index +match.token.length));
        profile
        (
            "parseJSON.scan",
            () =>
            {
                let scopeStack: { start: TokenEntry, closing:string, headerMode: HeaderMode, items: BracketEntry[] }[] = [];
                let i = 0;
                const writeCore = (entry: BracketEntry) => profile
                (
                    "parseJSON.scan.writeCore",
                    () =>
                    {
                        if ( ! isInlineScope(entry) || entry.isUnmatchBrackets)
                        {
                            const parent = scopeStack[scopeStack.length -1];
                            if (parent)
                            {
                                parent.items.push(entry);
                            }
                            else
                            {
                                result.push(entry);
                            }
                        }
                    }
                );
                const write = (closingToken: { index: number, token: string }) => profile
                (
                    "parseJSON.scan.write",
                    () =>
                    {
                        const scope = scopeStack.pop();
                        if (scope)
                        {
                            writeCore
                            ({
                                start: scope.start,
                                end:
                                {
                                    position: document.positionAt(closingToken.index +closingToken.token.length),
                                    token: closingToken.token,
                                },
                                headerMode: scope.headerMode,
                                isUnmatchBrackets: scope.closing !== regulate(closingToken.token),
                                items: scope.items,
                            });
                        }
                        else
                        {
                            //  余分な閉じ括弧
                            writeCore
                            ({
                                start:
                                {
                                    position: document.positionAt(closingToken.index),
                                    token: closingToken.token,
                                },
                                end:
                                {
                                    position: document.positionAt(closingToken.index +closingToken.token.length),
                                    token: closingToken.token,
                                },
                                headerMode: "smart",
                                isUnmatchBrackets: true,
                                items: [],
                            });
                        }
                    }
                );
                while(i < tokens.length)
                {
                    const token = regulate(tokens[i].token);
                    if (0 <= openingBlockComments.indexOf(token))
                    {
                        profile
                        (
                            "parseJSON.scan.blockComment",
                            () =>
                            {
                                const closing = closingBlockComments[openingBlockComments.indexOf(token)];
                                while(++i < tokens.length)
                                {
                                    if (closing === regulate(tokens[i].token))
                                    {
                                        ++i;
                                        break;
                                    }
                                }
                            }
                        );
                    }
                    else
                    if (0 <= lineComments.indexOf(token))
                    {
                        profile
                        (
                            "parseJSON.scan.lineComment",
                            () =>
                            {
                                const line = document.positionAt(tokens[i].index).line;
                                while(++i < tokens.length)
                                {
                                    if (line !== document.positionAt(tokens[i].index).line)
                                    {
                                        break;
                                    }
                                }
                            }
                        );
                    }
                    else
                    if (0 <= openingSymbolBrackets.indexOf(token))
                    {
                        profile
                        (
                            "parseJSON.scan.openingSymbolBracket",
                            () =>
                            {
                                const index = openingSymbolBrackets.indexOf(token);
                                scopeStack.push
                                ({
                                    start:
                                    {
                                        position: document.positionAt(tokens[i].index),
                                        token: tokens[i].token,
                                    },
                                    closing: closingSymbolBrackets[index],
                                    headerMode: symbolBracketsHeader[index],
                                    items: [],
                                });
                                ++i;
                            }
                        );
                    }
                    else
                    if (0 <= openingWordBrackets.indexOf(token) && isSureMatchWord(tokens[i]))
                    {
                        profile
                        (
                            "parseJSON.scan.openingWordBracket",
                            () =>
                            {
                                const index = openingWordBrackets.indexOf(token);
                                scopeStack.push
                                ({
                                    start:
                                    {
                                        position: document.positionAt(tokens[i].index),
                                        token: tokens[i].token,
                                    },
                                    closing: closingWordBrackets[index],
                                    headerMode: wordBracketsHeader[index],
                                    items: [],
                                });
                                ++i;
                            }
                        );
                    }
                    else
                    if
                    (
                        0 <= closingSymbolBrackets.indexOf(token) ||
                        (0 <= closingWordBrackets.indexOf(token) && isSureMatchWord(tokens[i]))
                    )
                    {
                        profile
                        (
                            "parseJSON.scan.closingBracket",
                            () =>
                            {
                                write(tokens[i]);
                                ++i;
                            }
                        );
                    }
                    else
                    if (0 <= openingInlineStrings.indexOf(token))
                    {
                        profile
                        (
                            "parseJSON.scan.inlineString",
                            () =>
                            {
                                const line = document.positionAt(tokens[i].index).line;
                                const closing = closingInlineStrings[openingInlineStrings.indexOf(token)];
                                while(++i < tokens.length)
                                {
                                    if (line !== document.positionAt(tokens[i].index).line)
                                    {
                                        break;
                                    }
                                    if (closing === regulate(tokens[i].token))
                                    {
                                        ++i;
                                        break;
                                    }
                                }
                            }
                        );
                    }
                    else
                    if (0 <= openingMultilineStrings.indexOf(token))
                    {
                        profile
                        (
                            "parseJSON.scan.multilineString",
                            () =>
                            {
                                const closing = closingMultilineStrings[openingMultilineStrings.indexOf(token)];
                                while(++i < tokens.length)
                                {
                                    if (closing === regulate(tokens[i].token))
                                    {
                                        ++i;
                                        break;
                                    }
                                }
                            }
                        );
                    }
                    else
                    {
                        debug(`unmatch-token: ${JSON.stringify(tokens[i])}`);
                        ++i;
                    }
                };
                profile
                (
                    "parseJSON.scan.rest",
                    () =>
                    {
                        while(0 < scopeStack.length)
                        {
                            write({ index: text.length, token: ""});
                        }
                    }
                );
            }
        );
        return result;
    }
);
export const aggressiveFormat = (document: vscode.TextDocument) => profile
(
    "aggressiveFormat",
    () =>
    {
        if (Config.enabled.get(document.languageId))
        {
            const documentCache = documentFormatCache.get(document);
            const isMuted = undefined !== documentCache?.isMuted ?
                documentCache.isMuted:
                isMutedAll;
            if ( ! isMuted)
            {
                
            }

        }
    }
);
const valueThen = <ValueT, ResultT>(value: ValueT | undefined, f: (value: ValueT) => ResultT) =>
{
    if (value)
    {
        return f(value);
    }
    return undefined;
};
const getDocumentTextLength = (document: vscode.TextDocument) => document.offsetAt
(
    document.lineAt(document.lineCount - 1).range.end
);
//const isClip = (lang: string, textLength: number) => clipByVisibleRange.get(lang)(textLength / Math.max(fileSizeLimit.get(lang), 1024));
const lastUpdateStamp = new Map<vscode.TextDocument, number>();
export const delayAggressiveFormat = (document: vscode.TextDocument): void =>
{
    const updateStamp = vscel.profiler.getTicks();
    lastUpdateStamp.set(document, updateStamp);
    const textLength = getDocumentTextLength(document);
    const logUnit = 16 *1024;
    const logRate = Math.pow(Math.max(textLength, logUnit) / logUnit, 1.0 / 2.0);
    //const lang = document.languageId;
    const delay = false ? //isClip(lang, textLength) ?
            30: // clipDelay.get(lang):
            logRate *
            (
                100 + //basicDelay.get(lang) +
                (
                    undefined === documentFormatCache.get(document) ?
                        100: // additionalDelay.get(lang):
                        0
                )
            );
    //debug(`document: ${document.fileName}, textLength: ${textLength}, logRate: ${logRate}, delay: ${delay}`);
    setTimeout
    (
        () =>
        {
            if (lastUpdateStamp.get(document) === updateStamp)
            {
                lastUpdateStamp.delete(document);
                aggressiveFormat(document);
            }
        },
        delay
    );
};
export const onDidChangeTextDocument = (document: vscode.TextDocument): void =>
{
    delayAggressiveFormat(document);
};
export const toggleMute = (document: vscode.TextDocument) =>
{
    const currentDocumentDecorationCache = makeSureDocumentFormatCache(document);
    currentDocumentDecorationCache.isMuted =
        undefined === currentDocumentDecorationCache.isMuted ?
            ! isMutedAll:
            ! currentDocumentDecorationCache.isMuted;
    delayAggressiveFormat(document);
};
vscel.profiler.start();
export const activate = (context: vscode.ExtensionContext) =>
{
    console.log('Congratulations, your extension "aggressive-auto-json" is now active!');
    context.subscriptions.push
    (
        vscode.commands.registerCommand
        (
            `aggressiveAutoJson.toggleMute`,
            () => valueThen(vscode.window.activeTextEditor?.document, toggleMute)
        ),
        vscode.commands.registerCommand
        (
            `aggressiveAutoJson.toggleMuteAll`, () =>
            {
                isMutedAll = ! isMutedAll;
                documentFormatCache.forEach(i => i.isMuted = undefined);
            }
        ),
        vscode.commands.registerCommand
        (
            'aggressive-auto-json.helloWorld',
            () =>
            {
                vscode.window.showInformationMessage('Hello World from Aggressive Auto JSON!');
            }
        ),
        vscode.workspace.onDidChangeTextDocument(event => onDidChangeTextDocument(event.document))
    );
};
export const deactivate = () => { };
