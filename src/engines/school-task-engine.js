const QUESTION_PATTERN = /quest(?:ã|a)o\s+0?(\d+)\s+de\s+0?(\d+)/gi;

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectQuestionType(section) {
  const value = normalize(section);
  if (/preench(?:a|endo).*lacunas|lacunas/.test(value)) return 'fill-blanks';
  if (/\bcerto\b[\s\S]{0,100}\berrado\b/.test(value)) return 'true-false';
  if (/(?:^|\n)\s*[a-d]\)/im.test(section)) return 'multiple-choice';
  if (/explique|justifique|descreva|redija|n[oº°]\s*minimo/.test(value)) return 'written-response';
  return 'question';
}

function extractOptions(section) {
  const matches = [...section.matchAll(/(?:^|\n)\s*([A-D])\)\s*([^\n]+)/gim)];
  return matches.map(match => ({letter: match[1].toUpperCase(), text: match[2].trim()}));
}

export class NexSchoolTaskEngine {
  parse(input = '') {
    const source = String(input ?? '').trim();
    if (!source) return null;

    const markers = [...source.matchAll(QUESTION_PATTERN)];
    const hasSchoolContext = /saladofuturo\.educacao\.sp\.gov\.br|sala do futuro|tarefa\s*sp|aprendizagem essencial|seduc[- ]sp/i.test(source);
    if (!markers.length || !hasSchoolContext) return null;

    const questions = markers.map((match, index) => {
      const start = match.index;
      const end = markers[index + 1]?.index ?? source.length;
      const section = source.slice(start, end).trim();
      const content = section.replace(QUESTION_PATTERN, '').trim();
      return {
        number: Number(match[1]),
        total: Number(match[2]),
        type: detectQuestionType(section),
        prompt: content.slice(0, 2400),
        options: extractOptions(section)
      };
    });

    const titleMatch = source.match(/tarefa\s*\d+\s*:\s*([^\r\n]+)/i);
    const subjectMatch = source.match(/(?:^|\n)\s*([A-ZÁÉÍÓÚÃÕÇ][A-Za-zÁÉÍÓÚáéíóúãõç ]{2,35})\s*-\s*\d{3,6}\s*(?:\r?\n|$)/);
    const total = Math.max(...markers.map(match => Number(match[2]) || 0), questions.length);

    return {
      title: titleMatch ? titleMatch[0].trim() : 'Atividade escolar',
      subject: subjectMatch ? subjectMatch[1].trim() : null,
      total,
      detected: questions.length,
      questions
    };
  }

  describe(task) {
    const labels = {
      'fill-blanks': 'completar lacunas',
      'true-false': 'certo ou errado',
      'multiple-choice': 'múltipla escolha',
      'written-response': 'resposta escrita',
      question: 'questão'
    };
    const lines = [
      'Identifiquei uma atividade da Sala do Futuro.',
      task.subject ? 'Matéria: ' + task.subject : null,
      'Atividade: ' + task.title,
      'Questões detectadas: ' + task.detected + ' de ' + task.total + '.',
      ...task.questions.map(question => question.number + '. ' + (labels[question.type] || labels.question))
    ].filter(Boolean);

    lines.push(
      '',
      'Posso analisar uma questão por vez e explicar como chegar à resposta.',
      'Digite, por exemplo: “me ajuda na questão 1”.',
      'A extensão apenas lê o conteúdo; não marca alternativas nem envia a atividade.'
    );
    return lines.join('\n');
  }

  guideQuestion(task, number) {
    const question = task.questions.find(item => item.number === number);
    if (!question) {
      return {
        type: 'school-question',
        text: 'Não encontrei a questão ' + number + ' no texto que foi lido. Clique novamente em “Ler página atual” na extensão para atualizar o conteúdo.'
      };
    }

    const type = {
      'fill-blanks': 'Completar lacunas',
      'true-false': 'Certo ou errado',
      'multiple-choice': 'Múltipla escolha',
      'written-response': 'Resposta escrita',
      question: 'Questão'
    }[question.type] || 'Questão';

    let guidance;
    if (question.type === 'fill-blanks') {
      guidance = 'Leia a frase inteira antes de preencher. Use as palavras próximas de cada lacuna para identificar qual conceito está faltando.';
    } else if (question.type === 'true-false') {
      guidance = 'Avalie cada afirmativa separadamente. Confira se toda a frase está correta; um detalhe incorreto já pode torná-la errada.';
    } else if (question.type === 'multiple-choice') {
      guidance = 'Compare cada alternativa com o que o enunciado realmente pergunta. Elimine as opções que falam de outro grupo, período ou acontecimento.';
    } else if (question.type === 'written-response') {
      guidance = 'Monte a resposta em sequência: apresente a mudança, explique o que a provocou e conclua mostrando a consequência. Use suas próprias palavras.';
    } else {
      guidance = 'Identifique primeiro o assunto central e divida o enunciado em partes menores antes de responder.';
    }

    const prompt = question.prompt.trim();
    const optionText = question.options.length
      ? '\nAlternativas:\n' + question.options.map(option => option.letter + ') ' + option.text).join('\n')
      : '';

    return {
      type: 'school-question',
      question,
      text: 'Questão ' + number + ' — ' + type + '\n\n' + prompt + optionText + '\n\nComo pensar: ' + guidance + '\n\nTente responder com suas palavras e me envie sua tentativa para eu conferir.'
    };
  }
}
