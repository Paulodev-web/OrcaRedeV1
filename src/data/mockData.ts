import { Material, GrupoItem, Concessionaria, Orcamento } from '@/types';

export const concessionarias: Concessionaria[] = [
  { id: '1', nome: 'RGE - Rio Grande Energia', sigla: 'RGE' },
  { id: '2', nome: 'Equatorial Energia', sigla: 'Equatorial' },
  { id: '3', nome: 'CEEE - Companhia Estadual de Energia Elétrica', sigla: 'CEEE' },
];

export const materiais: Material[] = [
  { id: '1', codigo: 'PAR-001', descricao: 'Parafuso Galvanizado 10x80mm', precoUnit: 2.50, unidade: 'UN' },
  { id: '2', codigo: 'CAB-001', descricao: 'Cabo de Alumínio 16mm²', precoUnit: 8.75, unidade: 'M' },
  { id: '3', codigo: 'POS-001', descricao: 'Poste de Concreto 9m', precoUnit: 285.00, unidade: 'UN' },
  { id: '4', codigo: 'ISO-001', descricao: 'Isolador de Porcelana 15kV', precoUnit: 12.30, unidade: 'UN' },
  { id: '5', codigo: 'CRU-001', descricao: 'Cruzeta de Concreto 2,40m', precoUnit: 95.00, unidade: 'UN' },
  { id: '6', codigo: 'FER-001', descricao: 'Ferragem para Fixação', precoUnit: 15.80, unidade: 'UN' },
  { id: '7', codigo: 'ATE-001', descricao: 'Aterramento com Haste', precoUnit: 125.00, unidade: 'UN' },
  { id: '8', codigo: 'TRA-001', descricao: 'Transformador 15kVA', precoUnit: 1250.00, unidade: 'UN' },
];

export const gruposItens: GrupoItem[] = [
  {
    id: '1',
    nome: 'Poste Simples - RGE',
    descricao: 'Conjunto básico para instalação de poste simples conforme padrão RGE',
    concessionariaId: '1',
    materiais: [
      { materialId: '3', quantidade: 1 },
      { materialId: '1', quantidade: 8 },
      { materialId: '6', quantidade: 2 },
      { materialId: '7', quantidade: 1 },
    ]
  },
  {
    id: '2',
    nome: 'Poste com Cruzeta - RGE',
    descricao: 'Poste completo com cruzeta para linha de distribuição RGE',
    concessionariaId: '1',
    materiais: [
      { materialId: '3', quantidade: 1 },
      { materialId: '5', quantidade: 1 },
      { materialId: '4', quantidade: 3 },
      { materialId: '1', quantidade: 12 },
      { materialId: '6', quantidade: 4 },
      { materialId: '7', quantidade: 1 },
    ]
  },
  {
    id: '3',
    nome: 'Poste com Transformador - RGE',
    descricao: 'Instalação completa com transformador padrão RGE',
    concessionariaId: '1',
    materiais: [
      { materialId: '3', quantidade: 1 },
      { materialId: '5', quantidade: 1 },
      { materialId: '8', quantidade: 1 },
      { materialId: '4', quantidade: 6 },
      { materialId: '1', quantidade: 16 },
      { materialId: '6', quantidade: 6 },
      { materialId: '7', quantidade: 2 },
    ]
  },
  {
    id: '4',
    nome: 'Poste Básico - Equatorial',
    descricao: 'Conjunto padrão Equatorial para poste básico',
    concessionariaId: '2',
    materiais: [
      { materialId: '3', quantidade: 1 },
      { materialId: '1', quantidade: 6 },
      { materialId: '6', quantidade: 2 },
      { materialId: '7', quantidade: 1 },
    ]
  },
];

export const orcamentos: Orcamento[] = [
  {
    id: '1',
    nome: 'Loteamento Solar da Serra',
    concessionariaId: '1',
    dataModificacao: '2024-12-15',
    status: 'Em Andamento',
    postes: []
  },
  {
    id: '2',
    nome: 'Extensão de Rede - Bairro Centro',
    concessionariaId: '2',
    dataModificacao: '2024-12-10',
    status: 'Finalizado',
    postes: []
  },
];
