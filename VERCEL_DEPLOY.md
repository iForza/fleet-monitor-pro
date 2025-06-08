# 🚀 Развертывание Fleet Monitor Pro в Vercel

## Быстрое развертывание

### Способ 1: Через GitHub интеграцию (Рекомендуется)

1. **Подготовка репозитория:**
   - ✅ Репозиторий уже настроен: `https://github.com/iForza/fleet-monitor-pro`
   - ✅ README переведен на русский язык
   - ✅ `package.json` правильно настроен
   - ✅ `vercel.json` создан для статического сайта

2. **Развертывание:**
   - Перейдите на [vercel.com](https://vercel.com)
   - Войдите через GitHub аккаунт
   - Нажмите "New Project"
   - Выберите репозиторий `fleet-monitor-pro`
   - Настройки будут автоматически определены из `vercel.json`

### Способ 2: Через Vercel CLI

```bash
# Установка Vercel CLI
npm i -g vercel

# Развертывание
cd fleet_monitor_v2
vercel

# Следуйте инструкциям в терминале
```

## Настройки для Vercel

### Автоматические настройки (уже готовы):

**vercel.json:**
```json
{
  "version": 2,
  "name": "fleet-monitor-pro",
  "buildCommand": "",
  "outputDirectory": "./",
  "installCommand": "npm install",
  "devCommand": "npm run serve",
  "framework": null
}
```

**package.json scripts:**
```json
{
  "start": "npm run serve",
  "serve": "http-server . -p 3000 -c-1",
  "build": "echo 'No build step required for static site' && exit 0",
  "deploy:vercel": "vercel"
}
```

## Настройки в Vercel Dashboard

Если потребуется ручная настройка:

- **Framework Preset:** `Other`
- **Build Command:** (пустое)
- **Output Directory:** `./`
- **Install Command:** `npm install`
- **Development Command:** `npm run serve`

## Переменные окружения

Для production добавьте в Vercel:

```
NODE_ENV=production
```

## Кастомный домен

1. В Vercel Dashboard → Settings → Domains
2. Добавьте ваш домен
3. Настройте DNS записи у провайдера домена

## После развертывания

Ваш сайт будет доступен по адресу:
- **Временный:** `https://fleet-monitor-pro-xxx.vercel.app`
- **Кастомный:** `https://your-domain.com` (если настроен)

## Проверка функциональности

✅ **Должно работать:**
- Русский интерфейс
- Интерактивная карта
- MQTT подключение
- PWA функции
- Аутентификация
- Отзывчивый дизайн

## Устранение неполадок

### Проблема: 404 ошибка
**Решение:** Убедитесь что `outputDirectory` установлена в `"./"`

### Проблема: MQTT не подключается
**Решение:** Проверьте WebSocket поддержку брокера

### Проблема: Карта не загружается
**Решение:** Проверьте API ключи для картографических сервисов

## Команды для локальной разработки

```bash
# Установка зависимостей
npm install

# Запуск локального сервера
npm start

# Валидация HTML
npm run validate

# Развертывание в Vercel
npm run deploy:vercel
```

## Полезные ссылки

- [Vercel Documentation](https://vercel.com/docs)
- [Fleet Monitor GitHub](https://github.com/iForza/fleet-monitor-pro)
- [Vercel Dashboard](https://vercel.com/dashboard)

---

🎉 **Готово!** Ваш Fleet Monitor Pro готов к развертыванию в Vercel! 