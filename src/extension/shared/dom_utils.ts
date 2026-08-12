// shared/dom_utils.ts

// B3-L4: XPath 无转义符，字符串字面量含单引号会损坏谓词语法。
// 用 concat 分段技巧生成合法字面量：it's → concat('it',"'",'s')。
function xpath_string_literal(value: string): string {
    if (!value.includes("'")) return `'${value}'`;
    const segments = value.split("'").map((part) => `'${part}'`);
    return `concat(${segments.join(',"\'",')})`;
}

/**
 * Build XPath for an element. Walks up to document body.
 * If element has id → tagName[@id='xxx'] and stops.
 * Otherwise → tagName[position_among_same_type_siblings]
 * Example: /html/body/div[2]/ul[1]/li[3]/button[1]
 */
export function build_xpath(element: Element): string {
    const segments: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === 1) {
        if (current.id) {
            segments.unshift(`${current.tagName.toLowerCase()}[@id=${xpath_string_literal(current.id)}]`);
            break;
        }

        let index = 1;
        const tag = current.tagName;
        const parent: Element | null = current.parentElement;
        if (parent) {
            for (const sibling of Array.from(parent.children) as Element[]) {
                if (sibling === current) break;
                if (sibling.tagName === tag) index++;
            }
        }

        segments.unshift(`${current.tagName.toLowerCase()}[${index}]`);

        if (current === document.body) break;
        current = current.parentElement;
    }

    return '/' + segments.join('/');
}
