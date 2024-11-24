const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');
const XLSX = require('xlsx'); // 引入exceljs库

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 创建MySQL数据库连接池
const pool = mysql.createPool({
	connectionLimit: 10,
	host: 'localhost',
	user: 'root', 
	password: 'pfl170086', 
	database: 'test', 
});


// 定义一个路由来处理前端发送的POST请求，添加联系人
app.post('/api/contact', async (req, res) => {
	const {
		name,
		phone,
		email,
		address
	} = req.body;
	if (!name) {
		return res.status(400).json({
			message: 'Name is required'
		});
	}
	try {
		const query = 'INSERT INTO contacts SET ?';
		const values = {
			name,
			phone,
			email,
			address
		};
		await pool.query(query, values);
		res.status(201).json({
			message: 'Contact information submitted successfully!'
		});
	} catch (error) {
		res.status(500).json({
			message: error.message
		});
	}
});

// 获取所有联系人信息，包括收藏状态
app.get('/api/contacts', (req, res) => {
	const query = `
        SELECT contacts.*, IFNULL(favor.contact_id, 0) as is_favorite
        FROM contacts
        LEFT JOIN favor ON contacts.id = favor.contact_id`;
	pool.query(query, (error, results) => {
		if (error) {
			return res.status(500).json({
				message: error.message
			});
		}
		res.status(200).json(results);
	});
});

// 新增：获取所有收藏的联系人信息
app.get('/api/favorites', (req, res) => {
	const query = 'SELECT * FROM favor';
	pool.query(query, (error, results) => {
		if (error) {
			return res.status(500).json({
				message: error.message
			});
		}
		res.status(200).json(results);
	});
});

// 更新联系人信息
app.put('/api/contact/:id', (req, res) => {
	const {
		name,
		phone,
		email,
		address
	} = req.body;
	const id = req.params.id;
	const query = 'SELECT phones, emails, addresses FROM contacts WHERE id = ?';
	pool.query(query, [id], async (error, results) => {
		if (error) {
			return res.status(500).json({
				message: error.message
			});
		}
		if (results.length === 0) {
			return res.status(404).json({
				message: 'Contact not found'
			});
		}
		const currentPhones = JSON.parse(results[0].phones);
		const currentEmails = JSON.parse(results[0].emails);
		const currentAddresses = JSON.parse(results[0].addresses);

		const newPhones = [...new Set(currentPhones.concat(phone))];
		const newEmails = [...new Set(currentEmails.concat(email))];
		const newAddresses = [...new Set(currentAddresses.concat(address))];

		const updateQuery =
		'UPDATE contacts SET phones = ?, emails = ?, addresses = ? WHERE id = ?';
		pool.query(updateQuery, [JSON.stringify(newPhones), JSON.stringify(newEmails), JSON
			.stringify(newAddresses), id
		], (error, results) => {
			if (error) {
				return res.status(500).json({
					message: error.message
				});
			}
			res.status(200).json({
				message: 'Contact updated successfully'
			});
		});
	});
});

// 删除联系人信息
app.delete('/api/contact/:id', (req, res) => {
	const id = req.params.id;
	const queryDeleteFromFavor = 'DELETE FROM favor WHERE contact_id = ?';
	pool.query(queryDeleteFromFavor, [id], (error, results) => {
		if (error) {
			return res.status(500).json({
				message: error.message
			});
		}
		const queryDeleteFromContacts = 'DELETE FROM contacts WHERE id = ?';
		pool.query(queryDeleteFromContacts, [id], (error, results) => {
			if (error) {
				return res.status(500).json({
					message: error.message
				});
			}
			res.status(200).json({
				message: 'Contact deleted successfully'
			});
		});
	});
});

// 添加联系人到收藏表
app.post('/api/contact/:id/favorite', async (req, res) => {
	const contactId = req.params.id;
	const queryGetContact = 'SELECT name, phone, email, address FROM contacts WHERE id = ?';
	pool.query(queryGetContact, [contactId], async (error, results) => {
		if (error) {
			console.error('Error getting contact:', error);
			return res.status(500).json({
				message: error.message
			});
		}
		if (results.length === 0) {
			return res.status(404).json({
				message: 'Contact not found'
			});
		}
		const {
			name,
			phone,
			email,
			address
		} = results[0];

		// 插入到favor表中
		const queryInsertFavorite =
			'INSERT INTO favor (contact_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE contact_id = VALUES(contact_id), name = VALUES(name), phone = VALUES(phone), email = VALUES(email), address = VALUES(address)';
		await pool.query(queryInsertFavorite, [contactId, name, phone, email, address]);
		res.status(200).json({
			message: 'Contact added to favorites'
		});
	});
});

// 从收藏表中删除联系人
app.delete('/api/contact/:id/favorite', async (req, res) => {
	const id = req.params.id;
	const query = 'DELETE FROM favor WHERE contact_id = ?';
	pool.query(query, [id], (error, results) => {
		if (error) {
			return res.status(500).json({
				message: error.message
			});
		}
		if (results.affectedRows === 0) {
			return res.status(404).json({
				message: 'Contact not found in favorites'
			});
		}
		res.status(200).json({
			message: 'Contact removed from favorites'
		});
	});
});

// 导出到Excel的路由
app.get('/api/contacts/export', (req, res) => {
	const query = `
        SELECT contacts.name, contacts.phone, contacts.email, contacts.address, IFNULL(favor.contact_id, 0) as is_favorite
        FROM contacts
        LEFT JOIN favor ON contacts.id = favor.contact_id`;
	pool.query(query, (error, results) => {
		if (error) {
			return res.status(500).json({
				message: error.message
			});
		}
		const workbook = XLSX.utils.book_new();
		const sheet = XLSX.utils.aoa_to_sheet([
			['Name', 'Phone', 'Email', 'Address', 'Is Favorite']
		].concat(results.map(contact => [
			contact.name,
			contact.phone,
			contact.email,
			contact.address,
			contact.is_favorite
		])));
		XLSX.utils.book_append_sheet(workbook, sheet, 'Contacts');
		const buffer = XLSX.write(workbook, {
			type: 'buffer',
			bookType: 'xlsx'
		});
		res.setHeader('Content-Disposition', 'attachment; filename=contacts.xlsx');
		res.setHeader('Content-Type',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.end(buffer);
	});
});

// 设置服务器监听的端口
const PORT = 3000;
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});