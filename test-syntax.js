try {
  new Function(process.argv[1]);
  console.log('Valid Syntax');
} catch (e) {
  console.log('Syntax Error:', e.message);
}
