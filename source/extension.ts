import * as vscode from 'vscode';
import * as vscel from '@wraith13/vscel';
const profile = vscel.profiler.profile;
let isMutedAll: boolean | undefined = undefined;
class DocumentDecorationCacheEntry
{
    isMuted: boolean | undefined;
    public constructor(document: vscode.TextDocument)
    {
        documentDecorationCache.set(document, this);
    }
}
const documentDecorationCache = new Map<vscode.TextDocument, DocumentDecorationCacheEntry>();
const makeSureDocumentDecorationCache = (document: vscode.TextDocument) =>
    documentDecorationCache.get(document) ?? new DocumentDecorationCacheEntry(document);
export const updateDecoration = (textEditor: vscode.TextEditor) => profile
(
    "updateDecoration",
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
const activeTextEditor = <T>(f: (textEditor: vscode.TextEditor) => T) => valueThen(vscode.window.activeTextEditor, f);
const getDocumentTextLength = (document: vscode.TextDocument) => document.offsetAt
(
    document.lineAt(document.lineCount - 1).range.end
);
//const isClip = (lang: string, textLength: number) => clipByVisibleRange.get(lang)(textLength / Math.max(fileSizeLimit.get(lang), 1024));
const lastUpdateStamp = new Map<vscode.TextEditor, number>();
export const delayUpdateDecoration = (textEditor: vscode.TextEditor): void =>
{
    const updateStamp = vscel.profiler.getTicks();
    lastUpdateStamp.set(textEditor, updateStamp);
    const textLength = getDocumentTextLength(textEditor.document);
    const logUnit = 16 *1024;
    const logRate = Math.pow(Math.max(textLength, logUnit) / logUnit, 1.0 / 2.0);
    //const lang = textEditor.document.languageId;
    const delay = false ? //isClip(lang, textLength) ?
            30: // clipDelay.get(lang):
            logRate *
            (
                100 + //basicDelay.get(lang) +
                (
                    undefined === documentDecorationCache.get(textEditor.document) ?
                        100: // additionalDelay.get(lang):
                        0
                )
            );
    //debug(`document: ${textEditor.document.fileName}, textLength: ${textLength}, logRate: ${logRate}, delay: ${delay}`);
    setTimeout
    (
        () =>
        {
            if (lastUpdateStamp.get(textEditor) === updateStamp)
            {
                lastUpdateStamp.delete(textEditor);
                updateDecoration(textEditor);
            }
        },
        delay
    );
};
export const delayUpdateDecorationByDocument = (document: vscode.TextDocument): void =>
{
    vscode.window.visibleTextEditors
        .filter(i => undefined !== i.viewColumn)
        .filter(i => i.document === document)
        .forEach(i => delayUpdateDecoration(i));
};
export const onDidChangeTextDocument = (document: vscode.TextDocument): void =>
{
    delayUpdateDecorationByDocument(document);
};
export const toggleMute = (textEditor: vscode.TextEditor) =>
{
    const currentDocumentDecorationCache = makeSureDocumentDecorationCache(textEditor.document);
    currentDocumentDecorationCache.isMuted =
        undefined === currentDocumentDecorationCache.isMuted ?
            ! isMutedAll:
            ! currentDocumentDecorationCache.isMuted;
    delayUpdateDecoration(textEditor);
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
            () => activeTextEditor(toggleMute)
        ),
        vscode.commands.registerCommand
        (
            `aggressiveAutoJson.toggleMuteAll`, () =>
            {
                isMutedAll = ! isMutedAll;
                documentDecorationCache.forEach(i => i.isMuted = undefined);
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
