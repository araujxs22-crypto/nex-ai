const DEFAULT_MAX_ITEMS = 5000;
const MAX_TEXT_LENGTH = 20000;

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .trim();
}

function validMetadata(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneMetadata(value) {
  if (value === undefined) return {};
  if (!validMetadata(value)) throw new TypeError('metadata deve ser um objeto simples.');
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError('metadata precisa ser serializável em JSON.');
  }
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object' || typeof item.text !== 'string') return null;
  const text = item.text.trim();
  if (!text || text.length > MAX_TEXT_LENGTH) return null;
  const metadata = validMetadata(item.metadata) ? item.metadata : {};
  return {
    id: String(item.id || ('memory-' + Date.now() + '-' + Math.random().toString(36).slice(2))),
    text,
    metadata,
    createdAt: Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : new Date().toISOString()
  };
}

export class NexMemory {
  constructor({key = 'nex-core-memory', storage = null, maxItems = DEFAULT_MAX_ITEMS} = {}) {
    if (!Number.isInteger(maxItems) || maxItems < 1) {
      throw new RangeError('maxItems deve ser um inteiro positivo.');
    }
    this.key = key;
    this.maxItems = maxItems;
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.items = this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeItem).filter(Boolean).slice(-this.maxItems);
    } catch {
      return [];
    }
  }

  persist() {
    if (!this.storage) return true;
    try {
      this.storage.setItem(this.key, JSON.stringify(this.items));
      return true;
    } catch {
      return false;
    }
  }

  remember(text, metadata = {}) {
    const value = String(text ?? '').trim();
    if (!value) throw new Error('Não é possível guardar uma memória vazia.');
    if (value.length > MAX_TEXT_LENGTH) {
      throw new RangeError('A memória excede o limite de ' + MAX_TEXT_LENGTH + ' caracteres.');
    }
    const item = {
      id: 'memory-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      text: value,
      metadata: cloneMetadata(metadata),
      createdAt: new Date().toISOString()
    };
    const previous = this.items;
    this.items = [...previous, item].slice(-this.maxItems);
    if (!this.persist()) {
      this.items = previous;
      throw new Error('Não foi possível persistir a memória. Verifique o espaço disponível no navegador.');
    }
    return item;
  }

  search(query, limit = 5) {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError('limit deve ser um inteiro maior ou igual a zero.');
    }
    if (limit === 0) return [];
    const normalizedQuery = normalize(query);
    const terms = [...new Set(normalizedQuery.split(/\s+/).filter(Boolean))];
    if (!terms.length) return [];

    return this.items
      .map(item => {
        const text = normalize(item.text);
        const title = normalize(item.metadata?.title || '');
        const tags = normalize(Array.isArray(item.metadata?.tags) ? item.metadata.tags.join(' ') : '');
        let score = normalizedQuery && text.includes(normalizedQuery) ? 5 : 0;
        for (const term of terms) {
          if (title.split(' ').includes(term)) score += 4;
          if (tags.split(' ').includes(term)) score += 3;
          if (text.split(' ').includes(term)) score += 1;
        }
        return {item, score};
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score
        || Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt))
      .slice(0, limit)
      .map(result => result.item);
  }

  all() {
    return this.items.slice();
  }

  remove(id) {
    const previous = this.items;
    this.items = previous.filter(item => item.id !== id);
    if (this.items.length === previous.length) return false;
    if (!this.persist()) {
      this.items = previous;
      throw new Error('Não foi possível atualizar a memória no armazenamento local.');
    }
    return true;
  }

  clear() {
    const previous = this.items;
    this.items = [];
    if (!this.persist()) {
      this.items = previous;
      throw new Error('Não foi possível limpar a memória no armazenamento local.');
    }
  }

  export() {
    return JSON.stringify(this.items, null, 2);
  }

  import(json) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('Arquivo de memória inválido: JSON corrompido.');
    }
    if (!Array.isArray(parsed)) throw new Error('Memória inválida: esperado um array.');
    if (parsed.length > this.maxItems) {
      throw new RangeError('O backup excede o limite de ' + this.maxItems + ' memórias.');
    }
    const normalized = parsed.map(normalizeItem);
    if (normalized.some(item => !item)) {
      throw new Error('Backup inválido: existem memórias sem texto ou com formato incorreto.');
    }
    const previous = this.items;
    this.items = normalized;
    if (!this.persist()) {
      this.items = previous;
      throw new Error('Não foi possível salvar o backup no armazenamento local.');
    }
    return this.items.length;
  }
}
