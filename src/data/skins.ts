// Cosmetic items sold in the base: patrol-car liveries and uniforms.
// Paid for with the points balance accumulated across shifts.

export type Modelo = 'sedan' | 'suv' | 'pickup';
export type Padrao = 'liso' | 'camo' | 'neon' | 'ouro';

export interface SkinViatura {
  id: string;
  nome: string;
  desc: string;
  preco: number;
  modelo: Modelo;
  base: string;
  faixa: string;
  detalhe: string;
  padrao: Padrao;
}

export type Chapeu = 'bone' | 'quepe' | 'capacete' | 'capuz' | 'abas';

export interface Farda {
  id: string;
  nome: string;
  desc: string;
  preco: number;
  camisa: string;
  calca: string;
  chapeu: Chapeu;
  chapeuCor: string;
  detalhe: string;
  camo?: boolean;
}

export const VIATURAS: SkinViatura[] = [
  { id: 'classica', nome: 'Sedã Clássica', desc: 'A viatura padrão de toda patrulha.', preco: 0,
    modelo: 'sedan', base: '#f4f4f0', faixa: '#1e3a8a', detalhe: '#facc15', padrao: 'liso' },
  { id: 'noturna', nome: 'Sedã Noturna', desc: 'Preta com faixa azul. Discreta na madrugada.', preco: 250,
    modelo: 'sedan', base: '#16191f', faixa: '#2563eb', detalhe: '#e5e7eb', padrao: 'liso' },
  { id: 'suv', nome: 'SUV Operacional', desc: 'Mais larga e imponente.', preco: 400,
    modelo: 'suv', base: '#f4f4f0', faixa: '#1e3a8a', detalhe: '#facc15', padrao: 'liso' },
  { id: 'rural', nome: 'Caminhonete Rural', desc: 'Para os trechos de terra do interior.', preco: 500,
    modelo: 'pickup', base: '#e8e2d0', faixa: '#14532d', detalhe: '#facc15', padrao: 'liso' },
  { id: 'camuflada', nome: 'SUV Camuflada', desc: 'Padrão de mata para operações de fronteira.', preco: 650,
    modelo: 'suv', base: '#4d5d33', faixa: '#1f2a14', detalhe: '#c9b458', padrao: 'camo' },
  { id: 'neon', nome: 'Interceptadora Neon', desc: 'Faixas que brilham no escuro.', preco: 900,
    modelo: 'sedan', base: '#0b1220', faixa: '#22d3ee', detalhe: '#f0abfc', padrao: 'neon' },
  { id: 'dourada', nome: 'Sedã Dourada', desc: 'Para quem domina o CTB de cabo a rabo.', preco: 1500,
    modelo: 'sedan', base: '#d4a017', faixa: '#1c1917', detalhe: '#fff7d6', padrao: 'ouro' },
];

export const FARDAS: Farda[] = [
  { id: 'operacional', nome: 'Farda Operacional', desc: 'Azul-marinho com boné. O básico bem-feito.', preco: 0,
    camisa: '#1e3a8a', calca: '#1e293b', chapeu: 'bone', chapeuCor: '#172554', detalhe: '#facc15' },
  { id: 'chuva', nome: 'Capa de Chuva', desc: 'Amarela, para os dias de temporal.', preco: 150,
    camisa: '#facc15', calca: '#1e293b', chapeu: 'capuz', chapeuCor: '#eab308', detalhe: '#a16207' },
  { id: 'verao', nome: 'Farda de Verão', desc: 'Camisa clara e chapéu de abas.', preco: 200,
    camisa: '#60a5fa', calca: '#d6c7a1', chapeu: 'abas', chapeuCor: '#c8b88a', detalhe: '#1e3a8a' },
  { id: 'motociclista', nome: 'Motociclista', desc: 'Jaqueta preta e capacete branco.', preco: 250,
    camisa: '#111827', calca: '#1f2937', chapeu: 'capacete', chapeuCor: '#f3f4f6', detalhe: '#ef4444' },
  { id: 'camuflada', nome: 'Farda Camuflada', desc: 'Para operações em área de mata.', preco: 350,
    camisa: '#4d5d33', calca: '#3f4a2a', chapeu: 'bone', chapeuCor: '#2f3a1e', detalhe: '#c9b458', camo: true },
  { id: 'gala', nome: 'Farda de Gala', desc: 'Quepe branco e detalhes dourados.', preco: 600,
    camisa: '#0f172a', calca: '#0f172a', chapeu: 'quepe', chapeuCor: '#f8fafc', detalhe: '#eab308' },
];

export const viaturaById = (id: string) => VIATURAS.find(v => v.id === id) ?? VIATURAS[0];
export const fardaById = (id: string) => FARDAS.find(f => f.id === id) ?? FARDAS[0];
