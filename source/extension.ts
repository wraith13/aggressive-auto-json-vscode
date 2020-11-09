import * as vscode from 'vscode';
import * as vscel from '@wraith13/vscel';
import packageJson from "../package.json";
const profile = vscel.profiler.profile;
module Config
{
    export const root = vscel.config.makeRoot(packageJson);
    export const enabled = root.makeEntry<boolean>("aggressiveAutoJson.enabled");
    export const autoAddComma = root.makeEntry<boolean>("aggressiveAutoJson.autoAddComma");
    export const autoRemoveComma = root.makeEntry<boolean>("aggressiveAutoJson.autoRemoveComma");
    export const autoAddColon = root.makeEntry<boolean>("aggressiveAutoJson.autoAddColon");
}
let isMutedAll: boolean | undefined = undefined;
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
export const aggressiveFormat = (document: vscode.TextDocument) => profile
(
    "aggressiveFormat",
    () =>
    {
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
