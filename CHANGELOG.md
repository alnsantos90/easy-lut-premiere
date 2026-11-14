# Changelog

Todas as mudanças importantes do projeto são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.7.1]

Primeira versão publicada no GitHub. Reúne tudo o que o painel faz hoje.

### Pré-visualização
- Captura do frame atual da timeline como base das miniaturas e do preview.
- Comparador Antes / Depois com divisor arrastável.
- Modo "Segurar clique para ver o antes".
- Miniaturas de cada LUT sobre o frame capturado, desenhadas sob demanda.
- Controle de tamanho das miniaturas (130 a 320 px).
- Intensidade (0 a 100%) refletida no preview.

### Aplicação
- Aplicação da LUT em um ou vários clipes de vídeo, no grupo Creative do Lumetri Color.
- Adição automática do efeito Lumetri Color quando o clipe não tem.
- Controle de intensidade em tempo real nos clipes alvo.
- Botão para remover a LUT do clipe.
- Destaque da LUT aplicada no clipe e exibição do nome da sequência ativa.
- Cópia do `.cube` para uma pasta com nome seguro antes de aplicar.

### Biblioteca
- Leitura recursiva de uma pasta de LUTs `.cube`, com categorias vindas das subpastas.
- Busca por nome e filtro por categoria.
- Favoritos.
- Coleções, com pasta própria e/ou LUTs adicionadas à mão.

### Interface e instalação
- Tema escuro com paleta própria e seletores personalizados com suporte a teclado.
- Instalador para Windows, em português, e instalação manual por cópia de pasta.
- Compatível com Premiere Pro 2020 (14.0) ou mais novo.
