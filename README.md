# node-typescript-no-transpiler-template
Absolute minimal setup for typescript projects without bundler because node v22.18.0 already enabled type striping by default.

Don't forget to use VSCode extension for [TypeScript Native Preview](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview).

Note: decorator functionalities are not natively supported. From [Node documentation](https://nodejs.org/api/typescript.html#type-stripping):

> Since Decorators are currently a [TC39 Stage 3 proposal](https://github.com/tc39/proposal-decorators), they are not transformed and will result in a parser error. Node.js does not provide polyfills and thus will not support decorators until they are supported natively in JavaScript.

To allow decorators, you must perform compilation anyway. However, `tsgo` is able to do this blazingly fast anyway. Just apply option:

```json5
// ...
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true,

        // for easier build management
        "rootDir": "src",
        "outDir": "dist",
// ...
```

And don't forget to install the compiler:

```sh
npm install @typescript/native-preview
```