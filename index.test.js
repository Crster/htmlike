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
    minifyURLs: true
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

test("render style", () => {
  const data = {
    name: "Crster",
    age: 30,
  };

  const result = htmlike.render("<style>body { color: red }</style>", data);

  expect(minify(result)).toBe(minify("<style>body { color: red }</style>"));
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
