// What a fleeing vehicle may be hiding. Found through the vehicle search
// (busca veicular) after an interception. Re-check against the current laws
// before publishing.

export type Local = 'porta_malas' | 'cabine' | 'motor';

export const LOCAIS: { id: Local; nome: string; icone: string }[] = [
  { id: 'porta_malas', nome: 'Porta-malas', icone: '🧳' },
  { id: 'cabine', nome: 'Cabine e bancos', icone: '🪑' },
  { id: 'motor', nome: 'Motor e chassi', icone: '⚙️' },
];

/** Answer options for "which crime?" — every Crime.tipo is one of these. */
export const TIPOS_CRIME = [
  'Tráfico de drogas',
  'Contrabando',
  'Descaminho',
  'Receptação',
  'Porte ilegal de arma de uso permitido',
  'Arma com numeração raspada',
  'Moeda falsa',
  'Adulteração de sinal identificador',
] as const;

export type TipoCrime = (typeof TIPOS_CRIME)[number];

export interface Crime {
  id: string;
  local: Local;
  achado: string;
  tipo: TipoCrime;
  artigo: string;
  explicacao: string;
}

export const CRIMES: Crime[] = [
  {
    id: 'maconha', local: 'porta_malas',
    achado: 'Sob o carpete do porta-malas, um fundo falso com 30 tabletes de maconha prensada.',
    tipo: 'Tráfico de drogas', artigo: 'Art. 33 da Lei 11.343/2006',
    explicacao: 'Transportar ou trazer consigo drogas sem autorização configura tráfico (pena de 5 a 15 anos). A quantidade, a forma de acondicionamento e o fundo falso indicam destinação comercial, afastando o uso pessoal (Art. 28).',
  },
  {
    id: 'cigarros', local: 'porta_malas',
    achado: 'O porta-malas e o banco traseiro estão tomados por caixas de cigarro paraguaio sem selo nem registro sanitário.',
    tipo: 'Contrabando', artigo: 'Art. 334-A do Código Penal',
    explicacao: 'Importar ou transportar mercadoria PROIBIDA (cigarro estrangeiro sem registro na Anvisa) é contrabando. Se a mercadoria fosse permitida e só faltasse pagar o imposto, seria descaminho.',
  },
  {
    id: 'eletronicos', local: 'cabine',
    achado: 'Embaixo dos bancos, 40 celulares novos importados, sem nota fiscal e sem declaração na Receita.',
    tipo: 'Descaminho', artigo: 'Art. 334 do Código Penal',
    explicacao: 'Iludir o pagamento de imposto devido pela entrada de mercadoria PERMITIDA é descaminho. A diferença para o contrabando é a mercadoria ser lícita.',
  },
  {
    id: 'pneus_roubados', local: 'porta_malas',
    achado: 'Oito pneus novos com o lote de uma carga roubada ontem. O motorista diz que "comprou barato de um conhecido", sem nota.',
    tipo: 'Receptação', artigo: 'Art. 180 do Código Penal',
    explicacao: 'Adquirir, transportar ou ocultar coisa que sabe ser produto de crime é receptação (1 a 4 anos). O preço vil e a falta de nota reforçam o dolo.',
  },
  {
    id: 'revolver', local: 'cabine',
    achado: 'Sob o banco do motorista, um revólver .38 municiado, com numeração íntegra. O condutor não tem porte.',
    tipo: 'Porte ilegal de arma de uso permitido', artigo: 'Art. 14 da Lei 10.826/2003',
    explicacao: 'Portar arma de fogo de uso permitido sem autorização é crime (2 a 4 anos). Dentro do veículo, fora da residência ou do trabalho, caracteriza porte e não posse (Art. 12).',
  },
  {
    id: 'pistola_raspada', local: 'cabine',
    achado: 'No console central, uma pistola com o número de série raspado.',
    tipo: 'Arma com numeração raspada', artigo: 'Art. 16, §1º, IV da Lei 10.826/2003',
    explicacao: 'Portar arma com numeração raspada, suprimida ou adulterada recebe a pena do porte de arma de uso restrito (3 a 6 anos), mesmo que o calibre seja permitido.',
  },
  {
    id: 'notas_falsas', local: 'cabine',
    achado: 'No porta-luvas, um maço de cédulas de R$ 100 com a mesma numeração e sem marca d\'água.',
    tipo: 'Moeda falsa', artigo: 'Art. 289 do Código Penal',
    explicacao: 'Guardar ou introduzir em circulação moeda falsa é crime (3 a 12 anos). Numeração repetida e ausência dos elementos de segurança denunciam a falsificação.',
  },
  {
    id: 'chassi', local: 'motor',
    achado: 'A numeração do chassi e do motor tem sinais de lixamento e remarcação; não confere com o documento.',
    tipo: 'Adulteração de sinal identificador', artigo: 'Art. 311 do Código Penal',
    explicacao: 'Adulterar ou remarcar chassi ou qualquer sinal identificador de veículo é crime (3 a 6 anos). Quem conduz ou transporta veículo que devesse saber adulterado responde pelas mesmas penas (Art. 311, §2º, III, incluído pela Lei 14.562/2023).',
  },
];
