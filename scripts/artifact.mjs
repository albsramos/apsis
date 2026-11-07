/**
 * Turns the artifact build (dist-artifact/index.html) into a page the Artifact host can wrap: the host adds
 * the doctype, <html>, <head> and <body>, so keep only what goes inside them.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('dist-artifact/index.html', 'utf8')
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
const keep = head
  .split('\n')
  .filter((l) => !/<meta charset|<meta name="viewport"/.test(l))
  .join('\n')
writeFileSync('dist-artifact/apsis.html', `${keep.trim().replace(/<title>.*<\/title>/, '<title>Apsis</title>')}\n<style>html,body{height:100%;background:#040406}</style>\n${body.trim()}\n`)
console.log('wrote dist-artifact/apsis.html')
