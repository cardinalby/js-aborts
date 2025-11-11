
// the interfaces are only necessary if you're not including https://github.com/microsoft/TypeScript/blob/main/src/lib/esnext.disposable.d.ts as a `lib` option
interface SymbolConstructor {
    readonly dispose: unique symbol
}

export interface Disposable {
    [Symbol.dispose](): void
}

// @ts-ignore - if it already exists as a readonly property, this is a no-op anyway
Symbol.dispose ??= Symbol('Symbol.dispose')