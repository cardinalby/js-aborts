# js-aborts

[AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) constructors inspired 
by Go's [context](https://pkg.go.dev/context) package

✅ Creating [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)s that 
inherit abortion from a parent [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)s 
and can be aborted manually or after a timeout.

✅ Created AbortControllers are `Disposable` and can be used with 
[using](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management) statement.

✅ Supports long timeouts (no [wraps around](https://github.com/nodejs/node-v0.x-archive/issues/3605)).

✅ Zero dependencies

## Disclaimer

For production use I would recommend using 
[`AbortSignal.timeout()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) and 
[`AbortSignal.any()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static). 

However, there are some issues with leaks if you use them together. My approach focuses on creating derived 
`AbortController` rather than `AbortSignal` to allow manual disposal of not needed controllers to avoid leaks.

## Install

```shell
npm install js-aborts
```

## API

```typescript
import { aborts } from 'js-aborts';
```

### 🔻`aborts.create`

```typescript
function create(...parentSignals: (AbortSignal|undefined)[]): AbortController;
```

Creates a new `AbortController`:
- If valid `parentSignals` are provided, abortion any of them also aborts the returned controller. 
- If any of `parentSignals` is already aborted, the returned controller is also already aborted with the reason 
  of the first aborted parent signal

### 🔻 `aborts.timeout`

```typescript
function timeout(timeoutMs: number, ...parentSignals: (AbortSignal|undefined)[]): AbortController;
```

Creates a new `AbortController` that aborts after the specified `timeoutMs`.
If valid `parentSignals` are provided, abortion any of them also aborts the returned controller.
If any of `parentSignals` is already aborted, the returned controller is also already aborted with the reason
of the first aborted parent signal

## Usage notes

### Example

```typescript
import { aborts } from 'js-aborts';

async function doSome(arg: string, signal?: AbortSignal) {
    // ...
}

async function doSomeComplex(signal?: AbortSignal) {
    // Create a controller that will be aborted after 5 seconds or when the parent 
    // signal is aborted. Thanks to `using` statement, the created controller will 
    // be disposed (clearing the internal timeout) automatically at the end of the scope.
    using ac = aborts.timeout(5000, signal)
    
    await doSome('first call', ac.signal)
    await doSome('second call', ac.signal)
}

```

### Always dispose the created controllers to avoid resource leaks

Unlike [`AbortSignal.timeout()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static), 
the lib's functions return `AbortController` rather than `AbortSignal`. 

This is done to allow manual abortion of not needed controllers to avoid leaks of internal timers/listeners.

It's better to dispose the created controllers explicitly when they are not needed anymore:

```typescript
// In typescript < 5.2:
function myFunc(signal?: AbortSignal) {
    const ac = aborts.timeout(5000, signal)
    try {
        // use ac.signal
    } finally {
        ac.abort()
    }
}
```

```typescript
// In typescript >= 5.2:
function myFunc(signal?: AbortSignal) {
    // Unlike standard AbortControllers, the created controller is Disposable
    using ac = aborts.timeout(5000, signal)
    // use ac.signal
}
```

> [!WARNING]  
> Be careful with `using` statement: it's not currently supported in all environments. The lib is built with
> ES6 target and polyfills `Symbol.dispose` that works with the code Typescript generates for `using` statements,
> but it's a bit fragile.