-- CreateTable
CREATE TABLE `idempotency_keys` (
    `key` VARCHAR(64) NOT NULL,
    `targetPath` VARCHAR(255) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `paramsHash` VARCHAR(64) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `status` ENUM('PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PROCESSING',
    `statusCode` INTEGER NULL,
    `response` LONGTEXT NULL,
    `lockedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `idempotency_keys_usuarioId_idx`(`usuarioId`),
    INDEX `idempotency_keys_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
