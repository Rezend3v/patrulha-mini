// Free situations bundled with the client. Paid ones come from the backend
// (see supabase/functions/situacoes). Always re-check against the compiled CTB:
// https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm

export type Classe = 'Leve' | 'Média' | 'Grave' | 'Gravíssima';
export type Veiculo = 'carro' | 'moto' | 'caminhao' | 'caminhonete';

/** What the player can see before ordering the stop. 'nenhum' = only found on inspection. */
export type Pista =
  | 'sem_capacete' | 'zigue_zague' | 'farol_apagado' | 'pelicula' | 'placa'
  | 'fumaca' | 'celular' | 'sem_cinto' | 'carroceria' | 'acostamento' | 'nenhum'
  | 'empinando' | 'farol_moto' | 'mao_guidom' | 'radar' | 'som' | 'lixo' | 'derrame'
  | 'luz_alta' | 'sem_placa';

/** Cues that can only be seen at night. */
export const PISTAS_NOTURNAS: Pista[] = ['farol_apagado', 'luz_alta'];

export interface Situacao {
  id: string;
  veiculo: Veiculo;
  pista: Pista;
  /** chance the driver flees when ordered to stop (0..1) */
  fuga: number;
  cena: string;
  artigo: string;
  classe: Classe;
  /** index into MEDIDAS */
  medida: number;
  explicacao: string;
}

export const CLASSES: Classe[] = ['Leve', 'Média', 'Grave', 'Gravíssima'];

/** Art. 259 (points on the licence) and Art. 258 (base fine, before any multiplier). */
export const CLASSE_INFO: Record<Classe, { pontos: number; multa: string }> = {
  Leve: { pontos: 3, multa: 'R$ 88,38' },
  Média: { pontos: 4, multa: 'R$ 130,16' },
  Grave: { pontos: 5, multa: 'R$ 195,23' },
  Gravíssima: { pontos: 7, multa: 'R$ 293,47' },
};

export const MEDIDAS = [
  'Nenhuma medida administrativa',
  'Retenção do veículo',
  'Remoção do veículo',
  'Recolhimento do documento de habilitação',
  'Recolhimento da habilitação e retenção do veículo',
  'Retenção do veículo e transbordo do excesso',
  'Recolhimento da habilitação e remoção do veículo',
];

export const SITUACOES: Situacao[] = [
  {
    id: 'moto_sem_capacete', veiculo: 'moto', pista: 'sem_capacete', fuga: 0.3,
    cena: 'O motociclista trafegava pela rodovia sem capacete de segurança.',
    artigo: 'Art. 244, I do CTB', classe: 'Gravíssima', medida: 3,
    explicacao: 'Conduzir motocicleta sem capacete é gravíssima, com suspensão do direito de dirigir. A medida é o recolhimento do documento de habilitação.',
  },
  {
    id: 'garupa_sem_capacete', veiculo: 'moto', pista: 'sem_capacete', fuga: 0.25,
    cena: 'O condutor usa capacete, mas o passageiro na garupa está sem.',
    artigo: 'Art. 244, II do CTB', classe: 'Gravíssima', medida: 3,
    explicacao: 'Transportar passageiro sem capacete também é gravíssima e quem responde é o condutor; recolhe-se o documento de habilitação.',
  },
  {
    id: 'crianca_moto', veiculo: 'moto', pista: 'nenhum', fuga: 0.15,
    cena: 'Na garupa da moto viaja uma criança de aproximadamente 7 anos.',
    artigo: 'Art. 244, V do CTB', classe: 'Gravíssima', medida: 3,
    explicacao: 'Transportar criança menor de 10 anos (ou sem condições de cuidar da própria segurança) em moto é gravíssima, com recolhimento do documento de habilitação.',
  },
  {
    id: 'alcool', veiculo: 'carro', pista: 'zigue_zague', fuga: 0.45,
    cena: 'O veículo fazia zigue-zague. O condutor tem hálito etílico e o etilômetro acusa influência de álcool.',
    artigo: 'Art. 165 do CTB', classe: 'Gravíssima', medida: 4,
    explicacao: 'Dirigir sob influência de álcool é gravíssima com multa multiplicada por 10 e suspensão por 12 meses. Medidas: recolhimento do documento de habilitação e retenção do veículo.',
  },
  {
    id: 'recusa_bafometro', veiculo: 'carro', pista: 'zigue_zague', fuga: 0.4,
    cena: 'O condutor se recusa a fazer o teste do etilômetro.',
    artigo: 'Art. 165-A do CTB', classe: 'Gravíssima', medida: 4,
    explicacao: 'A recusa ao teste tem as mesmas penalidades e medidas do Art. 165, independentemente de sinais de embriaguez.',
  },
  {
    id: 'cinto', veiculo: 'carro', pista: 'sem_cinto', fuga: 0.05,
    cena: 'O condutor dirige sem o cinto de segurança.',
    artigo: 'Art. 167 do CTB', classe: 'Grave', medida: 1,
    explicacao: 'Deixar de usar o cinto é grave. Medida: retenção do veículo até a colocação do cinto.',
  },
  {
    id: 'celular', veiculo: 'carro', pista: 'celular', fuga: 0.05,
    cena: 'O condutor dirige segurando o celular e digitando.',
    artigo: 'Art. 252, parágrafo único do CTB', classe: 'Gravíssima', medida: 0,
    explicacao: 'Segurar ou manusear o celular ao volante é gravíssima (o simples uso de fone é média, inciso VI). Não há medida administrativa.',
  },
  {
    id: 'farol_noite', veiculo: 'carro', pista: 'farol_apagado', fuga: 0.1,
    cena: 'À noite, o veículo trafega com a luz baixa apagada.',
    artigo: "Art. 250, I, 'a' do CTB", classe: 'Média', medida: 0,
    explicacao: 'Deixar de manter acesa a luz baixa à noite é média, sem medida administrativa.',
  },
  {
    id: 'pelicula', veiculo: 'carro', pista: 'pelicula', fuga: 0.15,
    cena: 'Os vidros dianteiros têm película tão escura que não se vê o interior.',
    artigo: 'Art. 230, XVI do CTB', classe: 'Grave', medida: 1,
    explicacao: 'Película fora do padrão do CONTRAN é grave, com retenção do veículo para regularização.',
  },
  {
    id: 'placa_ilegivel', veiculo: 'carro', pista: 'placa', fuga: 0.3,
    cena: 'A placa traseira está encoberta e não dá para ler os caracteres.',
    artigo: 'Art. 230, VI do CTB', classe: 'Gravíssima', medida: 2,
    explicacao: 'Placa sem condições de legibilidade é gravíssima, com remoção do veículo.',
  },
  {
    id: 'licenciamento', veiculo: 'carro', pista: 'nenhum', fuga: 0.2,
    cena: 'Na consulta, o veículo aparece com o licenciamento vencido.',
    artigo: 'Art. 230, V do CTB', classe: 'Gravíssima', medida: 2,
    explicacao: 'Veículo não licenciado é gravíssima, com remoção do veículo.',
  },
  {
    id: 'sem_documento', veiculo: 'carro', pista: 'nenhum', fuga: 0.05,
    cena: 'O condutor é habilitado, mas não porta nenhum documento obrigatório e não há versão digital.',
    artigo: 'Art. 232 do CTB', classe: 'Leve', medida: 1,
    explicacao: 'Conduzir sem documento de porte obrigatório é leve, com retenção do veículo até a apresentação do documento.',
  },
  {
    id: 'sem_habilitacao', veiculo: 'carro', pista: 'nenhum', fuga: 0.4,
    cena: 'O condutor admite que nunca tirou habilitação.',
    artigo: 'Art. 162, I do CTB', classe: 'Gravíssima', medida: 1,
    explicacao: 'Dirigir sem possuir habilitação é gravíssima (multa x3), com retenção do veículo até a apresentação de condutor habilitado.',
  },
  {
    id: 'pneu_liso', veiculo: 'caminhonete', pista: 'nenhum', fuga: 0.1,
    cena: 'Os pneus estão completamente carecas e há vazamento de óleo.',
    artigo: 'Art. 230, XVIII do CTB', classe: 'Grave', medida: 1,
    explicacao: 'Veículo em mau estado de conservação, comprometendo a segurança, é grave, com retenção para regularização.',
  },
  {
    id: 'fumaca', veiculo: 'caminhao', pista: 'fumaca', fuga: 0.1,
    cena: 'O caminhão solta fumaça preta densa e o escapamento está adulterado.',
    artigo: 'Art. 230, XI do CTB', classe: 'Grave', medida: 1,
    explicacao: 'Descarga livre ou silenciador defeituoso/adulterado é grave, com retenção para regularização.',
  },
  {
    id: 'excesso_peso', veiculo: 'caminhao', pista: 'nenhum', fuga: 0.1,
    cena: 'Na balança, o caminhão está acima do peso bruto total permitido.',
    artigo: 'Art. 231, V do CTB', classe: 'Média', medida: 5,
    explicacao: 'Excesso de peso é média, com acréscimo por faixa de excesso. Medida: retenção do veículo e transbordo da carga excedente.',
  },
  {
    id: 'passageiro_carroceria', veiculo: 'caminhonete', pista: 'carroceria', fuga: 0.15,
    cena: 'Há pessoas sendo transportadas na caçamba da caminhonete.',
    artigo: 'Art. 230, II do CTB', classe: 'Gravíssima', medida: 2,
    explicacao: 'Transportar passageiros em compartimento de carga é gravíssima, com remoção do veículo.',
  },
  {
    id: 'equipamento', veiculo: 'caminhonete', pista: 'nenhum', fuga: 0.05,
    cena: 'Na vistoria, falta o triângulo de sinalização.',
    artigo: 'Art. 230, IX do CTB', classe: 'Grave', medida: 1,
    explicacao: 'Conduzir sem equipamento obrigatório ou com ele inoperante é grave, com retenção para regularização.',
  },
  {
    id: 'acostamento', veiculo: 'carro', pista: 'acostamento', fuga: 0.2,
    cena: 'Para fugir do congestionamento, o condutor trafega pelo acostamento.',
    artigo: 'Art. 193 do CTB', classe: 'Gravíssima', medida: 0,
    explicacao: 'Transitar pelo acostamento é gravíssima com multa x3, sem medida administrativa.',
  },
  {
    id: 'seta', veiculo: 'carro', pista: 'nenhum', fuga: 0.05,
    cena: 'O condutor trocou de faixa várias vezes sem dar seta.',
    artigo: 'Art. 196 do CTB', classe: 'Grave', medida: 0,
    explicacao: 'Deixar de indicar com antecedência a mudança de faixa é grave, sem medida administrativa.',
  },
  // ---- habilitação ----
  {
    id: 'cnh_suspensa', veiculo: 'carro', pista: 'nenhum', fuga: 0.45,
    cena: 'Na consulta, o condutor está com o direito de dirigir suspenso, mas segue dirigindo.',
    artigo: 'Art. 162, II do CTB', classe: 'Gravíssima', medida: 4,
    explicacao: 'Dirigir com o direito de dirigir suspenso ou habilitação cassada é gravíssima (multa x3). Medidas: recolhimento do documento de habilitação e retenção do veículo até a apresentação de condutor habilitado.',
  },
  {
    id: 'cnh_vencida', veiculo: 'carro', pista: 'nenhum', fuga: 0.05,
    cena: 'A CNH do condutor venceu há cinco meses.',
    artigo: 'Art. 162, V do CTB', classe: 'Gravíssima', medida: 4,
    explicacao: 'Dirigir com a CNH vencida há mais de 30 dias é gravíssima. Medidas: recolhimento da CNH e retenção do veículo até a apresentação de condutor habilitado.',
  },
  {
    id: 'categoria_errada', veiculo: 'caminhao', pista: 'nenhum', fuga: 0.1,
    cena: 'O motorista do caminhão pesado é habilitado apenas na categoria B.',
    artigo: 'Art. 162, III do CTB', classe: 'Gravíssima', medida: 1,
    explicacao: 'Conduzir veículo de categoria diferente da habilitação é gravíssima (multa x2), com retenção do veículo até a apresentação de condutor habilitado.',
  },
  // ---- segurança de ocupantes ----
  {
    id: 'cadeirinha', veiculo: 'carro', pista: 'nenhum', fuga: 0.05,
    cena: 'Um bebê de 1 ano viaja no colo da mãe, no banco traseiro, sem dispositivo de retenção.',
    artigo: 'Art. 168 do CTB', classe: 'Gravíssima', medida: 1,
    explicacao: 'Transportar criança sem observar as normas de segurança especiais (cadeirinha, bebê-conforto) é gravíssima, com retenção do veículo até que a irregularidade seja sanada.',
  },
  {
    id: 'fone', veiculo: 'carro', pista: 'nenhum', fuga: 0.05,
    cena: 'O condutor dirige com fones de ouvido nos dois ouvidos, ouvindo música.',
    artigo: 'Art. 252, VI do CTB', classe: 'Média', medida: 0,
    explicacao: 'Dirigir usando fones conectados a aparelho sonoro ou celular é média, sem medida administrativa. Segurar ou manusear o celular é outra infração, gravíssima (parágrafo único).',
  },
  // ---- motocicletas ----
  {
    id: 'empinando', veiculo: 'moto', pista: 'empinando', fuga: 0.5,
    cena: 'O motociclista seguia equilibrando a moto apenas na roda traseira.',
    artigo: 'Art. 244, III do CTB', classe: 'Gravíssima', medida: 3,
    explicacao: 'Fazer malabarismo ou equilibrar-se em uma roda é gravíssima, com suspensão do direito de dirigir e recolhimento do documento de habilitação.',
  },
  {
    id: 'moto_farol', veiculo: 'moto', pista: 'farol_moto', fuga: 0.15,
    cena: 'Em pleno dia, a motocicleta trafega com o farol apagado.',
    artigo: 'Art. 244, IV do CTB', classe: 'Gravíssima', medida: 3,
    explicacao: 'Para motocicletas, o farol deve ficar aceso dia e noite. Conduzir com os faróis apagados é gravíssima, com recolhimento do documento de habilitação.',
  },
  {
    id: 'mao_guidom', veiculo: 'moto', pista: 'mao_guidom', fuga: 0.1,
    cena: 'O motociclista conduz com uma das mãos fora do guidom, segurando uma sacola.',
    artigo: 'Art. 244, VII do CTB', classe: 'Média', medida: 0,
    explicacao: 'Conduzir moto sem segurar o guidom com ambas as mãos (salvo para indicar manobras) é média, sem medida administrativa.',
  },
  // ---- velocidade e manobras ----
  {
    id: 'radar_20', veiculo: 'carro', pista: 'radar', fuga: 0.1,
    cena: 'O radar da viatura marcou 112 km/h em trecho de 100 km/h.',
    artigo: 'Art. 218, I do CTB', classe: 'Média', medida: 0,
    explicacao: 'Excesso de velocidade de até 20% acima da máxima é média, sem medida administrativa.',
  },
  {
    id: 'radar_50', veiculo: 'carro', pista: 'radar', fuga: 0.3,
    cena: 'O radar da viatura marcou 138 km/h em trecho de 100 km/h.',
    artigo: 'Art. 218, II do CTB', classe: 'Grave', medida: 0,
    explicacao: 'Excesso entre 20% e 50% acima da máxima é grave, sem medida administrativa. Acima de 50% passa a ser gravíssima (x3) com suspensão (inciso III).',
  },
  {
    id: 'ultrapassa_acostamento', veiculo: 'caminhonete', pista: 'acostamento', fuga: 0.25,
    cena: 'O condutor usou o acostamento para ultrapassar a fila de veículos.',
    artigo: 'Art. 202, I do CTB', classe: 'Gravíssima', medida: 0,
    explicacao: 'Ultrapassar pelo acostamento é gravíssima com multa x5, sem medida administrativa. Não confunda com apenas transitar pelo acostamento (Art. 193).',
  },
  {
    id: 'racha', veiculo: 'carro', pista: 'radar', fuga: 0.6,
    cena: 'Dois carros emparelhados aceleravam disputando quem chega primeiro.',
    artigo: 'Art. 173 do CTB', classe: 'Gravíssima', medida: 6,
    explicacao: 'Disputar corrida é gravíssima (multa x10) com suspensão do direito de dirigir. Medidas: recolhimento do documento de habilitação e remoção do veículo. Também pode configurar crime (Art. 308).',
  },
  // ---- conduta e equipamentos ----
  {
    id: 'som_alto', veiculo: 'carro', pista: 'som', fuga: 0.1,
    cena: 'O carro trafega com som em volume tão alto que se ouve a dezenas de metros.',
    artigo: 'Art. 228 do CTB', classe: 'Grave', medida: 1,
    explicacao: 'Usar som em volume ou frequência não autorizados pelo CONTRAN é grave, com retenção do veículo para regularização.',
  },
  {
    id: 'lixo', veiculo: 'carro', pista: 'lixo', fuga: 0.05,
    cena: 'O passageiro arremessou latas e embalagens pela janela.',
    artigo: 'Art. 172 do CTB', classe: 'Média', medida: 0,
    explicacao: 'Atirar do veículo ou abandonar na via objetos ou substâncias é média, sem medida administrativa.',
  },
  {
    id: 'luz_alta', veiculo: 'caminhonete', pista: 'luz_alta', fuga: 0.1,
    cena: 'À noite, a caminhonete trafega com farol alto ofuscando quem vem atrás e à frente.',
    artigo: 'Art. 223 do CTB', classe: 'Grave', medida: 1,
    explicacao: 'Transitar com farol desregulado ou com a luz alta perturbando a visão de outros condutores é grave, com retenção do veículo para regularização.',
  },
  {
    id: 'sem_placa', veiculo: 'carro', pista: 'sem_placa', fuga: 0.5,
    cena: 'O veículo não tem placa traseira.',
    artigo: 'Art. 230, IV do CTB', classe: 'Gravíssima', medida: 2,
    explicacao: 'Conduzir sem qualquer uma das placas de identificação é gravíssima, com remoção do veículo.',
  },
  // ---- carga e transporte ----
  {
    id: 'derramando_carga', veiculo: 'caminhao', pista: 'derrame', fuga: 0.1,
    cena: 'O caminhão de areia vai derramando carga na pista, sem lona.',
    artigo: 'Art. 231, II do CTB', classe: 'Gravíssima', medida: 1,
    explicacao: 'Transitar derramando, lançando ou arrastando a carga sobre a via é gravíssima, com retenção do veículo para regularização.',
  },
  {
    id: 'tacografo', veiculo: 'caminhao', pista: 'nenhum', fuga: 0.05,
    cena: 'O tacógrafo do caminhão está desconectado e não registra a velocidade.',
    artigo: 'Art. 230, XIV do CTB', classe: 'Grave', medida: 1,
    explicacao: 'Conduzir com registrador de velocidade e tempo (tacógrafo) viciado ou defeituoso, quando exigido, é grave, com retenção para regularização.',
  },
  {
    id: 'transporte_pirata', veiculo: 'caminhonete', pista: 'nenhum', fuga: 0.2,
    cena: 'O condutor cobra passagem de 6 passageiros, mas o veículo não é licenciado para transporte remunerado.',
    artigo: 'Art. 231, VIII do CTB', classe: 'Média', medida: 1,
    explicacao: 'Efetuar transporte remunerado de pessoas sem licença para esse fim é média, com retenção do veículo.',
  },
];
