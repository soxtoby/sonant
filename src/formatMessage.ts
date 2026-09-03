import { parseMessageTemplate } from "./messageTemplate.js"

export interface FormatMessageOptions {
    quoteStrings?: boolean
    serializeObjects?: boolean
}

export function formatMessage(
    messageTemplate: string,
    properties: Record<string, unknown>,
    options: FormatMessageOptions = {},
) {
    let tokens = parseMessageTemplate(messageTemplate)
    let result = ''

    for (let token of tokens) {
        result += token.type == 'text'
            ? token.text
            : renderValue(properties[token.propertyName], options)
    }

    return result
}

function renderValue(value: unknown, options: FormatMessageOptions): string {
    if (typeof value == 'string')
        return options.quoteStrings ? JSON.stringify(value) : value

    if (value != null
        && typeof value == 'object'
        && options.serializeObjects
    ) {
        try {
            return JSON.stringify(value)
        } catch { }
    }

    return String(value)
}
