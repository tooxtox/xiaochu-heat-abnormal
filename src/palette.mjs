const defaults={mint:'#9DE4C2',teal:'#294F4C',orange:'#ED8B50',red:'#D93B4A',purple:'#241726',pink:'#E9ACC8',black:'#090C13',white:'#C8CCD1',paper:'#E9EDE5'};
export const palette={...defaults};
const roles={mint:'NORMAL',teal:'OBSERVE',orange:'WARNING',red:'CRITICAL',purple:'CORRUPTED',pink:'MEMORY',black:'VOID',white:'SILENCE',paper:'PAPER'};
export function configurePalette(config={}){for(const [ink,role] of Object.entries(roles))palette[ink]=config[role]||defaults[ink]}
export function resolveInk(value){const key=Object.keys(defaults).find(key=>defaults[key]===value);return key?palette[key]:value}
