const str = "   $$ E = mc^2 $$";
console.log(str.replace(/^(\s*)\$\$(?!\$)/gm, '$$$$'));
console.log("\\[ E \\]".replace(/\\\[([\s\S]+?)\\\]/g, '$$$$$1$$$$'));
console.log("\\( E \\)".replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$'));
console.log("\\$".replace(/\\(\$)/g, '$1'));
