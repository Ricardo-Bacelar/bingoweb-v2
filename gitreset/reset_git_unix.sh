#!/bin/bash
echo "=== INICIANDO RESET DO HISTÓRICO GIT ==="

# Nome do app Heroku (edite se necessário)
APP_NAME=bingoweb-v2

# Criar branch temporário
git checkout --orphan temp

# Adicionar arquivos
git add .

# Criar novo commit
git commit -m "Commit inicial limpo"

# Deletar master antigo
git branch -D master

# Renomear branch atual
git branch -m master

# Forçar push para Heroku
git push -f heroku master

echo "=== RESET FINALIZADO COM SUCESSO ==="
