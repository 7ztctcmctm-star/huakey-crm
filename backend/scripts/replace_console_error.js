const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');

function getLoggerPath(relativeToRoutes) {
  const depth = relativeToRoutes.split(/[\\/]/).filter(Boolean).length - 1;
  const prefix = depth > 0 ? '../'.repeat(depth + 1) : '../';
  return `${prefix}config/logger`;
}

function splitArgs(str) {
  const args = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let parenDepth = 0;
  for (const ch of str) {
    if (inString) {
      current += ch;
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === '(') { parenDepth++; current += ch; continue; }
    if (ch === ')') { parenDepth--; current += ch; continue; }
    if (ch === ',' && parenDepth === 0) {
      args.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current);
  return args;
}

function transformContent(content, loggerPath) {
  // 添加 logger 引入（如果还没有）
  if (!content.includes('const logger = require')) {
    const requireMatches = content.match(/\nconst [^=]+= require\([^)]+\);/g);
    if (requireMatches && requireMatches.length) {
      const last = requireMatches[requireMatches.length - 1];
      content = content.replace(last, last + `\nconst logger = require('${loggerPath}');`);
    } else {
      // 兜底：放在文件最开头
      content = `const logger = require('${loggerPath}');\n` + content;
    }
  }

  // 替换带字符串消息 + 可选参数的 console.error
  content = content.replace(
    /console\.error\(\s*((?:'(?:\\'|[^'])*')|(?:"(?:\\"|[^"])*"))(?:\s*,\s*(.*))?\s*\);/g,
    (match, msg, rest) => {
      let meta = "{ traceId: req.traceId || 'N/A' }";
      if (rest && rest.trim()) {
        const args = splitArgs(rest);
        const props = [];
        args.forEach((arg, idx) => {
          const a = arg.trim();
          if (!a) return;
          if (/^(error|err|dbError|e)$/.test(a)) {
            props.push(`error: ${a}.stack || ${a}.message`);
          } else if (/\.(message|stack)$/.test(a)) {
            props.push(`error: ${a}`);
          } else if (/^[a-zA-Z_$][\w$]*$/.test(a)) {
            props.push(`${a}: ${a}`);
          } else {
            props.push(`extra${idx}: ${a}`);
          }
        });
        if (props.length) {
          meta = `{ ${props.join(', ')}, traceId: req.traceId || 'N/A' }`;
        }
      }
      return `logger.error(${msg}, ${meta});`;
    }
  );

  // 兜底：console.error(error) 形式（第一个参数不是字符串）
  content = content.replace(
    /console\.error\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\);/g,
    (match, expr) => {
      const varName = expr.split('.')[0];
      return `logger.error('捕获到错误', { error: ${varName}.stack || ${varName}.message, traceId: req.traceId || 'N/A' });`;
    }
  );

  return content;
}

function processDir(dir, rel) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relPath = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      processDir(full, relPath);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (!content.includes('console.error')) continue;
    const loggerPath = getLoggerPath(relPath);
    const newContent = transformContent(content, loggerPath);
    fs.writeFileSync(full, newContent, 'utf8');
    console.log(`✓ ${relPath}`);
  }
}

processDir(ROUTES_DIR, '');
console.log('Done');
