export function parseMessageTemplate(messageTemplate: string): MessageTemplateToken[] {
    let tokens: MessageTemplateToken[] = []
    let position = 0

    while (position < messageTemplate.length) {
        let open = messageTemplate.indexOf('{', position)
        if (open == -1) {
            pushText(tokens, messageTemplate.slice(position))
            break
        }

        let close = messageTemplate.indexOf('}', open + 1)
        if (close == -1) {
            pushText(tokens, messageTemplate.slice(position))
            break
        }

        pushText(tokens, messageTemplate.slice(position, open))

        let placeholder = messageTemplate.slice(open + 1, close)
        if (validPropertyName.test(placeholder))
            tokens.push({ type: 'property', propertyName: placeholder })
        else
            pushText(tokens, messageTemplate.slice(open, close + 1))

        position = close + 1
    }

    return tokens
}

const validPropertyName = /^[A-Za-z_][A-Za-z0-9_.]*$/

export function bindProperties(tokens: MessageTemplateToken[], properties: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        tokens
            .filter(t => t.type == 'property')
            .map(p => [p.propertyName, properties[p.propertyName]] as const))
}

function pushText(tokens: MessageTemplateToken[], text: string): void {
    if (text.length) {
        let previous = tokens[tokens.length - 1]
        if (previous?.type == 'text')
            previous.text += text
        else
            tokens.push({ type: 'text', text })
    }
}

export type MessageTemplateToken = TextToken | PropertyToken

export interface TextToken {
    type: 'text'
    text: string
}

export interface PropertyToken {
    type: 'property'
    propertyName: string
}
