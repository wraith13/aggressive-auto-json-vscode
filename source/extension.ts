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
interface DiagnosticEntry
{
    type: "lack" | "unnecessary";
    position: vscode.Position;
    charactor: string;
}
const makeRegExpPart = (text: string) => text.replace(/([\\\/\*\[\]\(\)\{\}\|\.\,])/gmu, "\\$1").replace(/\s+/, "\\s");
const scanJSON = (document: vscode.TextDocument) => profile
(
    "scanJSON",
    (): DiagnosticEntry[] =>
    {
        const result:DiagnosticEntry[] = [];
        const openingBlockComments = ["/*"];
        const closingBlockComments = ["*/"];
        const lineComments = ["//"];
        const openingSymbolBrackets = ["{", "["];
        const closingSymbolBrackets = ["}", "]"];
        const colon = ":";
        const comma = ",";
        const openingInlineStrings = ["\""];
        const escapeInlineStrings = ["\\\""];
        const closingInlineStrings = ["\""];
        const pattern = (<string[]>[])
            .concat(openingBlockComments)
            .concat(closingBlockComments)
            .concat(lineComments)
            .concat(openingSymbolBrackets)
            .concat(closingSymbolBrackets)
            .concat([ colon, comma, ])
            .concat(openingInlineStrings)
            .concat(escapeInlineStrings)
            .concat(closingInlineStrings)
            .filter((entry, index, array) => "" !== entry && index === array.indexOf(entry))
            .map(i => `${makeRegExpPart(i)}`)
            .join("|");
        const text = document.getText();
        const tokens = regExpExecToArray
        (
            new RegExp(pattern, "gu"),
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
        profile
        (
            "scanJSON.scan",
            () =>
            {
                type Scope = "object" | "array";
                let scopeStack: Scope[] = [];
                let i = 0;
                let previousToken: typeof tokens[0] | undefined;
                while(i < tokens.length)
                {
                    const token = tokens[i].token;
                    if (0 <= openingBlockComments.indexOf(token))
                    {
                        profile
                        (
                            "scanJSON.scan.blockComment",
                            () =>
                            {
                                const closing = closingBlockComments[openingBlockComments.indexOf(token)];
                                while(++i < tokens.length)
                                {
                                    if (closing === tokens[i].token)
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
                            "scanJSON.scan.lineComment",
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
                    if (0 <= closingSymbolBrackets.indexOf(token))
                    {
                        if (previousToken)
                        {
                            switch(previousToken.token)
                            {
                            }
                        }
                        if ("{" === token)
                        {
                            scopeStack.push("object");
                            previousToken = tokens[i];
                        }
                        else
                        //if ("[" === token)
                        {
                            scopeStack.push("array");
                            previousToken = tokens[i];
                        }
                    }
                    else
                    if (0 <= closingSymbolBrackets.indexOf(token))
                    {
                        if ("," === token)
                        {
                            
                        }
                        scopeStack.pop(); // openingSymbolBrackets と一致して無くても気にしない
                    }
                    else
                    if (0 <= openingInlineStrings.indexOf(token))
                    {
                        profile
                        (
                            "scanJSON.scan.inlineString",
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
                                    if (closing === tokens[i].token)
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
                    "scanJSON.scan.rest",
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
export const aggressiveFormat = (textEditor: vscode.TextEditor) => profile
(
    "aggressiveFormat",
    () =>
    {
        const errors = scanJSON(textEditor.document);
        if (0 < errors.length)
        {
            textEditor.edit
            (
                editBuilder => errors.forEach
                (
                    i =>
                    {
                        //  💣 他の insert/delete の影響ってどうなるの？　自分で調整しないとダメ？　それとも vscode 側で勝手にやってくれる？
                        switch(i.type)
                        {
                        case "lack":
                            editBuilder.delete
                            (
                                new vscode.Range
                                (
                                    i.position,
                                    new vscode.Position(i.position.line, i.position.character +i.charactor.length)
                                )
                            );
                            break;
                        case "unnecessary":
                            editBuilder.insert
                            (
                                i.position,
                                i.charactor
                            );
                            break;
                        }
                    }
                )
            );
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
export const delayAggressiveFormat = (textEditor: vscode.TextEditor): void =>
{
    const updateStamp = vscel.profiler.getTicks();
    lastUpdateStamp.set(textEditor.document, updateStamp);
    const textLength = getDocumentTextLength(textEditor.document);
    const logUnit = 16 *1024;
    const logRate = Math.pow(Math.max(textLength, logUnit) / logUnit, 1.0 / 2.0);
    //const lang = document.languageId;
    const delay = false ? //isClip(lang, textLength) ?
            30: // clipDelay.get(lang):
            logRate *
            (
                100 + //basicDelay.get(lang) +
                (
                    undefined === documentFormatCache.get(textEditor.document) ?
                        100: // additionalDelay.get(lang):
                        0
                )
            );
    //debug(`document: ${document.fileName}, textLength: ${textLength}, logRate: ${logRate}, delay: ${delay}`);
    setTimeout
    (
        () =>
        {
            if (lastUpdateStamp.get(textEditor.document) === updateStamp)
            {
                lastUpdateStamp.delete(textEditor.document);
                if (Config.enabled.get(textEditor.document.languageId))
                {
                    const documentCache = documentFormatCache.get(textEditor.document);
                    const isMuted = undefined !== documentCache?.isMuted ?
                        documentCache.isMuted:
                        isMutedAll;
                    if ( ! isMuted)
                    {
                        aggressiveFormat(textEditor);
                    }
                }
            }
        },
        delay
    );
};
export const toggleMute = (textEditor: vscode.TextEditor) =>
{
    const currentDocumentDecorationCache = makeSureDocumentFormatCache(textEditor.document);
    currentDocumentDecorationCache.isMuted =
        undefined === currentDocumentDecorationCache.isMuted ?
            ! isMutedAll:
            ! currentDocumentDecorationCache.isMuted;
    delayAggressiveFormat(textEditor);
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
            () => valueThen(vscode.window.activeTextEditor, toggleMute)
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
            `aggressiveAutoJson.toggleMute`,
            () => valueThen(vscode.window.activeTextEditor, aggressiveFormat)
        ),
        vscode.commands.registerCommand
        (
            'aggressive-auto-json.helloWorld',
            () =>
            {
                vscode.window.showInformationMessage('Hello World from Aggressive Auto JSON!');
            }
        ),
        vscode.workspace.onDidChangeTextDocument
        (
            () => valueThen(vscode.window.activeTextEditor, delayAggressiveFormat)
        )
    );
};
export const deactivate = () => { };
