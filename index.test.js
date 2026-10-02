const htmlike = require("./dist");
const htmlMinifier = require("html-minifier");

const minify = (htmlString) => {
  return htmlMinifier.minify(htmlString, {
    caseSensitive: true,
    collapseWhitespace: true,
    preserveLineBreaks: false,
    removeComments: true,
    removeTagWhitespace: true,
    minifyCSS: true,
    minifyJS: true,
    minifyURLs: true,
  });
};

test("render hello world", () => {
  const result = htmlike.render("<p>Hello World</p>");
  expect(minify(result)).toBe(minify("<p>Hello World</p>"));
});

test("render hello world from variable", () => {
  const data = {
    world: "Hello",
    hello: "World",
  };

  const result = htmlike.render("<p>{world} {hello}</p>", data);
  expect(minify(result)).toBe(minify(`<p>${data.world} ${data.hello}</p>`));
});

test("render calculation", () => {
  const result = htmlike.render("<p>1 + 2 = {2 + 1}</p>");
  expect(minify(result)).toBe(minify("<p>1 + 2 = 3</p>"));
});

test("render list", () => {
  const data = {
    animals: [
      { name: "Dog", sound: "Roff" },
      { name: "Cat", sound: "Meow" },
      { name: "Goat", sound: "Meee" },
    ],
  };

  const result = htmlike.render(
    "<ul><for {animal of animals}><li>A {animal.name} says {animal.sound}<li></for></ul>",
    data
  );

  expect(minify(result)).toBe(
    minify(
      `<ul>${data.animals
        .map((animal) => `<li>A ${animal.name} says ${animal.sound}<li>`)
        .join("")}</ul>`
    )
  );
});

test("render condition", () => {
  const data = {
    name: "Crster",
    age: 30,
  };

  const result = htmlike.render(
    "<switch {age > 20}><case {true}>{name} is old</case><case {false}>{name} is still young</case></switch>",
    data
  );

  expect(minify(result)).toBe(minify(`${data.name} is old`));
});

test("render multiple condition", () => {
  const data = {
    name: "Crster",
    age: 30,
  };

  const result = htmlike.render(
    '<switch {name}><case {"John"}>Not Me</case><case {"Ray"}>Not Me</case><case {"Crster"}>This is me</case><case {"Jest"}>Not Me</case></switch>',
    data
  );

  expect(minify(result)).toBe(minify("This is me"));
});

test("render view", () => {
  const data = {
    world: "Hello",
    hello: "World",
  };

  const template =
    "<view {layout}><block {footer}>This is a footer</block><p>Hi, {world} {hello}</p></view>";

  const result = htmlike.render(
    {
      currentWorkingDirectory: "./components",
      defaultFileExtension: "html",
      template,
    },
    data
  );

  expect(minify(result)).toBe(
    minify("<h1></h1><p>Hi, Hello World</p>This is a footer")
  );
});

test("render view + args", () => {
  const data = {
    world: "Hello",
    hello: "World",
  };

  const template =
    '<view {layout({ title: "Earth" })}><block {footer}>This is a footer</block><p>Hi, {world} {hello}</p></view>';

  const result = htmlike.render(
    {
      currentWorkingDirectory: "./components",
      defaultFileExtension: "html",
      template,
    },
    data
  );

  expect(minify(result)).toBe(
    minify("<h1>Earth</h1><p>Hi, Hello World</p>This is a footer")
  );
});

test("render script", () => {
  const data = {
    name: "Crster",
    age: 30,
  };

  const result = htmlike.render(
    `
    <script>
      let name = "Amiel";
      let fullName = ${"`${name}-{{name}}`"}
    </script>
  `,
    data
  );

  expect(minify(result)).toBe(
    minify(
      `
      <script>
        let name = "Amiel";
        let fullName = ${"`${name}-Crster`"}
      </script>
    `
    )
  );
});

test("render script with throw", () => {
  const data = {
    message: "Oh snap!",
  };

  const result = htmlike.render(`
    <script>
      promises
        .catch(err => { throw new Error("On no!") })
        .then(result => ({ ...result }))
        .then(result => ({ ...result, part: 2 }))
        .then(result => { return { ...result } })
        .then(result => { return { ...result, part: 4 } })
        .catch(err => { throw new Error("{message}{{message}}{message}") })
    </script>
  `, data);

  expect(minify(result)).toBe(
    minify(`
      <script>
        promises
          .catch(err => { throw new Error("On no!") })
          .then(result => ({ ...result }))
          .then(result => ({ ...result, part: 2 }))
          .then(result => { return { ...result } })
          .then(result => { return { ...result, part: 4 } })
          .catch(err => { throw new Error("{message}Oh snap!{message}") })
      </script>
  `)
  );
});

test("render style", () => {
  const data = {
    name: "Crster",
    age: 30,
  };

  const result = htmlike.render("<style>body { color: red }</style>", data);

  expect(minify(result)).toBe(minify("<style>body { color: red }</style>"));
});

test("escapes html special characters by default", () => {
  const data = {
    name: "<img src=x onerror=alert(1)>",
  };

  const result = htmlike.render("<p>{name}</p>", data);
  expect(result).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
});

test("renders raw unescaped html with triple braces", () => {
  const data = {
    name: "<b>bold</b>",
  };

  const result = htmlike.render("<p>{{{name}}}</p>", data);
  expect(result).toBe("<p><b>bold</b></p>");
});

test("blocks code injection via malicious input keys", () => {
  const data = {
    "x, y=(globalThis.pwned = true)": "safe",
  };

  const result = htmlike.render("<p>{x}</p>", data);
  expect(result).toBe("<p></p>");
  expect(globalThis.pwned).toBeUndefined();
});

test("render subview", () => {
  const data = {
    world: "Hello",
    hello: "World",
  };

  const template =
    "<view {layout}><block {footer}>This is a footer<view {sub}/></block><p>Hi, {world} {hello}</p></view>";

  const result = htmlike.render(
    {
      currentWorkingDirectory: "./components",
      defaultFileExtension: "html",
      template,
    },
    data
  );

  expect(minify(result)).toBe(
    minify(
      "<h1></h1><p>Hi, Hello World</p>This is a footer<p>This is a subview</p>"
    )
  );
});

test("render two sibling for loops independently", () => {
  const data = { a: [1, 2], b: [3, 4] };

  const result = htmlike.render(
    "<for {x of a}>A:{x} </for><for {x of b}>B:{x} </for>",
    data
  );

  expect(minify(result)).toBe(minify("A:1 A:2 B:3 B:4 "));
});

test("render two sibling switch blocks independently", () => {
  const result = htmlike.render(
    '<switch {1}><case {1}>one</case><case {2}>two</case></switch>-<switch {2}><case {1}>one</case><case {2}>two</case></switch>'
  );

  expect(result).toBe("one-two");
});

test("render nested for loops", () => {
  const data = {
    groups: [
      { items: [1, 2] },
      { items: [3, 4] },
    ],
  };

  const result = htmlike.render(
    "<for {g of groups}><for {x of g.items}>{x}</for>|</for>",
    data
  );

  expect(result).toBe("12|34|");
});

test("render switch nested inside a case body", () => {
  const result = htmlike.render(
    `<switch {1}><case {1}><switch {2}><case {1}>inner-one</case><case {2}>inner-two</case></switch></case><case {2}>outer-two</case></switch>`
  );

  expect(result).toBe("inner-two");
});

test("render switch nested inside a for loop with correct per-iteration scope", () => {
  const data = { items: [1, 2, 3, 4] };

  const result = htmlike.render(
    `<for {n of items}><switch {n % 2}><case {0}>{n}:even</case><case {1}>{n}:odd</case></switch></for>`,
    data
  );

  expect(result).toBe("1:odd2:even3:odd4:even");
});

test("render nested named blocks inside a view/layout", () => {
  const template =
    "<view {layout}><block {body}>Outer-Start<block {inner}>Inner-Content</block>Outer-End</block></view>";

  const result = htmlike.render(
    {
      currentWorkingDirectory: "./components",
      defaultFileExtension: "html",
      template,
    },
    {}
  );

  expect(result).not.toMatch(/<<|base64|header=/);
  expect(minify(result)).toContain(minify("Outer-StartOuter-End"));
});
