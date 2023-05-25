# HTMLike

`Htmlike` is a template engine primarily used in expressjs

## Syntax Example
```html
<view {layout}>
    <block {body}>
        <p>This will be rendered inside "layout > body" block</p>
        <p>{variable.name} passed from render()</p>
    </block>

    <!-- This is a for loop sample -->
    <ul>
        <for {animal of animals}>
            <li>{animal}</li>
        </for>
    </ul>
</view>
```

## Quick Start

### Installation
```
npm install @crster/htmlike
```

### nodejs
```js
    var htmlike = require('@crster/htmlike');

    var data = { world: "Template engine" }
    var output = htmlike.render('<p>Hello {world}</p>', data);

    // <p>Hello Template engine</p>
```

### express
```js
    const express = require("express")
    const htmlike = require("@crster/htmlike")

    const app = express()

    app.engine("html", htmlike.expressViewEngine)
    app.set("view engine", "html")
    app.set("views", "./src/views")
```

## Render Expression
```html
<p>One + Two = {1 + 2}</p>
```

## Escape Expression
```html
<p>use this {{"Hello"}}</p>

// will be rendered to

<p>use this {Hello}</p>
```

## Render List
```html
<for {user of users}>
    <p>{user.name}</p>
</for>
```

## Render Condition
```html
<switch {users.length}>
    <case {0}>
        <p>No result found</p>
    </case>
    <case {1}>
        <p>The choosen one</p>
    </case>
    <case {5}>
        <p>The best five</p>
    </case>
    <case {}>
        <p>This is switch default</p>
    </case>
</switch>

// To render if else like statement
<switch {!!users}>
    <case {true}>
        <p>User is not null</p>
    </case>
    <case {false}>
        <p>User is null</p>
    </case>
</switch>
```

## Whitelisted tags
`<script>`, `<noscript>`, `<style>` and `<pre>` are whitelisted.
meaning braces `{}` will work as usual. to render the expression inside you must use two braces `{{}}`

```html
data is { name: "Doe" }

<script>
  let name = "John";
  let alias = `${name}-{{name}}`;
</script>

// will render to
<script>
  let name = "John";
  let alias = `${name}-Doe`;
</script>
```

## Render Layout + Extending Block

### Create layout.chtml
```html
<!-- This code inside layout file -->
<html>
    <head>
        <block {css}>
            <style>
                body {
                    color: blue;
                }
            </style>
        </block>
    </head>
    <body>
        <block {body}/>
        <block {script}/>
    </body>
</html>
```

### Create welcome.chtml
```html
<view {layout}>
    <block {css}>
        <style>body { color: red }</style>
    </block>

    <block {body}>
        <p>Markup goes here!</p>
    </block>
</view>
```