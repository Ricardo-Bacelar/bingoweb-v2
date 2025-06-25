@echo off
echo === INICIANDO RESET DO HISTÓRICO GIT ===
echo.

:: Nome do app Heroku (edite se necessário)
set APP_NAME=bingoweb-v2

:: Passo 1: Criar branch temporário
git checkout --orphan temp

:: Passo 2: Adicionar arquivos
git add .

:: Passo 3: Criar novo commit
git commit -m "Commit inicial limpo"

:: Passo 4: Apagar branch antigo
git branch -D master

:: Passo 5: Renomear para master
git branch -m master

:: Passo 6: Forçar push para o Heroku
git push -f heroku master

echo.
echo === RESET FINALIZADO COM SUCESSO ===
pause
