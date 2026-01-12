#!/usr/bin/env bun

const res = await fetch('http://localhost:3000/health');
const data = await res.json();
console.log(data);
