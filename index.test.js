const htmlike = require("./dist");

test("render hello world", () => {
  const result = htmlike.render("<p>Hello World</p>");
  expect(result).toBe("<p>Hello World</p>");
});

test("render hello world from variable", () => {
  const data = {
    world: "Hello",
    hello: "World",
  };

  const result = htmlike.render("<p>{world} {hello}</p>", data);
  expect(result).toBe(`<p>${data.world} ${data.hello}</p>`);
});

test("render calculation", () => {
  const result = htmlike.render("<p>1 + 2 = {2 + 1}</p>");
  expect(result).toBe("<p>1 + 2 = 3</p>");
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

  expect(result).toBe(
    `<ul>${data.animals
      .map((animal) => `<li>A ${animal.name} says ${animal.sound}<li>`)
      .join("")}</ul>`
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

  expect(result).toBe(`${data.name} is old`);
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

  expect(result).toBe("This is me");
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

  expect(result).toBe("\r\n    <h1></h1>\r\n\r\n\r\n<p>Hi, Hello World</p>\r\nThis is a footer");
});

test("render view + args", () => {
  const data = {
    world: "Hello",
    hello: "World",
  };

  const template =
    "<view {layout({ title: \"Earth\" })}><block {footer}>This is a footer</block><p>Hi, {world} {hello}</p></view>";

  const result = htmlike.render(
    {
      currentWorkingDirectory: "./components",
      defaultFileExtension: "html",
      template,
    },
    data
  );

  expect(result).toBe("\r\n    <h1>Earth</h1>\r\n\r\n\r\n<p>Hi, Hello World</p>\r\nThis is a footer");
});

test("render script", () => {
  const data = {
    name: "Crster",
    age: 30,
  };

  const result = htmlike.render(`
    <script>
      let name = \`{age}$\{{name}\}\`;
      
      function setName(newName){
        name = newName;
      }
    </script>
  `, data);

  expect(result).toContain("let name = `"+ data.age +"${"+ data.name +"}`");
})

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

  expect(result).toBe("\r\n    <h1></h1>\r\n\r\n\r\n<p>Hi, Hello World</p>\r\nThis is a footer<p>This is a subview</p>");
})