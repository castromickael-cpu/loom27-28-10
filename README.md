# Loom + Supabase

Front end estático (HTML/CSS/JS) agora ligado ao Supabase: login real, banco PostgreSQL com RLS, upload de imagens e verificação de alunos no servidor.

## Passo a passo

1. **Crie o projeto** em supabase.com.
2. **Banco:** abra *SQL Editor*, cole `supabase/schema.sql` inteiro e execute (cria tabelas, políticas RLS, funções e buckets de imagem).
3. **Chaves:** em *Project Settings → API* copie a *Project URL* e a chave *anon/publishable* para `supabase-config.js`.
4. **Autenticação** (*Authentication → Providers → Email*):
   - O Loom já tem verificação própria (código do administrador). Para simplificar, desative **Confirm email**. Se mantiver ativado, o cadastro avisa para confirmar o e-mail e só depois entrar.
   - Em *URL Configuration* adicione o endereço do seu site (ex.: `http://localhost:5500` e o domínio final) em **Site URL / Redirect URLs** — necessário para "Esqueceu a senha?".
5. **Rode por um servidor** (não abra o arquivo com duplo clique): extensão *Live Server* do VS Code, `npx serve`, ou publique no Netlify/Vercel/GitHub Pages.
6. **Crie sua conta** pelo site e então vire administrador (SQL Editor):
   ```sql
   update public.profiles set is_admin = true, verificado = true where username = 'seuusuario';
   ```
7. **Fluxo de verificação:** aluno se cadastra → admin abre `admin.html`, clica em "Usar" no cadastro pendente, copia/envia o código por e-mail → aluno digita em "Verificar conta".

## Tabelas

| Tabela | Função |
|---|---|
| `profiles` | perfil público (1:1 com `auth.users`) |
| `preferencias` | tema, fonte, notificações (privado) |
| `links` | até 6 links por aluno |
| `follows` | seguidor ↔ seguido (N:N) |
| `posts`, `post_likes`, `comentarios` | feed, curtidas, comentários e respostas |
| `visitas` | 1 visita por visitante/dia (contador de views) |
| `verificacoes` | códigos de verificação (inacessível ao front end) |
| `avisos`, `eventos` | tela inicial (admins escrevem pelo Table Editor) |

`v_perfis` é uma view com seguidores, seguindo, posts e views já calculados.

## O que mudou no comportamento

- Senhas ficam no Supabase Auth (bcrypt); acabou o hash SHA-256 no navegador.
- O código de verificação não é mais derivado de um segredo no JavaScript: é gerado no servidor, expira em 7 dias e bloqueia após 5 erros.
- `admin.html` não usa mais `ADMIN_CODE`: exige uma conta com `is_admin = true`.
- Só alunos **verificados** postam **e comentam** (antes só postar era bloqueado). Para liberar comentários, remova `and public.esta_verificado()` da policy `coment_insert`.
- Cadastro: turma "Portos" passou a usar `PRT` (antes `PORTOS`, que não batia com o resto do sistema).
- Se o aluno ocultar as visitas, o contador some para os outros e ele sai do ranking "Mais vistos".
- Novo: `redefinir.html` (recuperação de senha).
