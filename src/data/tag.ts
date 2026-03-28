import { prisma } from '#/db'
import { createServerFn } from '@tanstack/react-start'

const defaultTags = [
  'typescript',
  'javascript',
  'golang',
  'python',
  'react',
  'next-js',
  'html',
  'css',
  'prisma',
  'sql',
  'nest-js',
]

export const createDefaultTags = createServerFn({ method: 'POST' }).handler(
  async () => {
    const data = defaultTags.map((t) => ({
      name: t,
    }))
    await prisma.tag.createMany({ data, skipDuplicates: true })
  },
)
