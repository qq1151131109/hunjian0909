import React, { useState, useEffect } from 'react'
import { Modal, Input, Button, message, Card, Tag, Space } from 'antd'
import { UserOutlined, EditOutlined } from '@ant-design/icons'

interface UserIdentityProps {
  onUserChange: (userId: string, userName: string) => void
}

const UserIdentity: React.FC<UserIdentityProps> = ({ onUserChange }) => {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [userName, setUserName] = useState('')
  const [currentUser, setCurrentUser] = useState<{id: string, name: string} | null>(null)

  // 生成用户ID（基于时间戳+随机数，简单但有效）
  const generateUserId = () => {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  }

  // 从localStorage加载用户信息
  useEffect(() => {
    const savedUser = localStorage.getItem('videoProcessor_user')
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser)
        setCurrentUser(user)
        onUserChange(user.id, user.name)
      } catch (error) {
        console.error('加载用户信息失败:', error)
      }
    } else {
      // 首次访问，显示设置用户名的弹窗
      setIsModalVisible(true)
    }
  }, [onUserChange])

  // 保存用户信息
  const saveUser = () => {
    if (!userName.trim()) {
      message.warning('请输入用户名')
      return
    }
    
    const user = {
      id: generateUserId(),
      name: userName.trim()
    }
    
    localStorage.setItem('videoProcessor_user', JSON.stringify(user))
    setCurrentUser(user)
    setIsModalVisible(false)
    onUserChange(user.id, user.name)
    message.success(`欢迎，${user.name}！`)
  }

  // 修改用户名
  const changeUser = () => {
    setUserName(currentUser?.name || '')
    setIsModalVisible(true)
  }

  return (
    <>
      {/* 用户信息显示 */}
      {currentUser && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space>
            <Tag icon={<UserOutlined />} color="blue">
              当前用户: {currentUser.name}
            </Tag>
            <Button 
              size="small" 
              type="link" 
              icon={<EditOutlined />}
              onClick={changeUser}
            >
              修改
            </Button>
          </Space>
        </Card>
      )}

      {/* 设置用户名弹窗 */}
      <Modal
        title="设置用户名"
        open={isModalVisible}
        onOk={saveUser}
        onCancel={() => {
          if (!currentUser) {
            message.warning('请设置用户名后继续使用')
          } else {
            setIsModalVisible(false)
          }
        }}
        closable={!!currentUser} // 有用户信息时才能关闭
        maskClosable={!!currentUser}
        okText="确定"
        cancelText="取消"
      >
        <div>
          <p>为了区分不同用户的任务，请设置一个用户名：</p>
          <Input
            placeholder="请输入您的用户名"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onPressEnter={saveUser}
            maxLength={20}
            autoFocus
          />
          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
            💡 提示：用户名会显示在任务列表中，方便识别您的任务
          </div>
        </div>
      </Modal>
    </>
  )
}

export default UserIdentity